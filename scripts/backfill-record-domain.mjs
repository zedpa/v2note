/**
 * 回填 record.domain — 为所有 domain IS NULL 的日记自动归类
 *
 * 按 user_id 分组，每批 20 条，调用 AI 批量分类。
 * 支持断点续跑（跳过已有 domain 的记录）。
 *
 * Usage: node scripts/backfill-record-domain.mjs [--dry-run]
 */
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, "../gateway/node_modules/"));
const pg = require("pg");
const dotenv = require("dotenv");
dotenv.config({ path: resolve(__dirname, "../gateway/.env") });

const dryRun = process.argv.includes("--dry-run");
const BATCH_SIZE = 20;

const pool = new pg.Pool({
  host: process.env.RDS_HOST,
  port: parseInt(process.env.RDS_PORT ?? "5432"),
  database: process.env.RDS_DATABASE,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function callAI(messages) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl =
    process.env.AI_BASE_URL ??
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = process.env.AI_MODEL ?? "qwen3.5-plus";

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(300000),
  });

  if (!resp.ok) throw new Error(`AI API error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.choices[0].message.content;
}

async function main() {
  try {
    // 1. 获取所有需要回填的 record，按 user_id 分组
    const result = await pool.query(`
      SELECT r.id, r.user_id, COALESCE(s.short_summary, s.long_summary, t.text) AS content
      FROM record r
      LEFT JOIN summary s ON s.record_id = r.id
      LEFT JOIN transcript t ON t.record_id = r.id
      WHERE r.domain IS NULL
        AND r.user_id IS NOT NULL
        AND r.status = 'done'
        AND r.source NOT IN ('todo_voice', 'command_voice')
      ORDER BY r.user_id, r.created_at DESC
    `);

    console.log(`\n📋 待回填记录: ${result.rows.length} 条`);
    if (result.rows.length === 0) {
      console.log("✅ 所有记录已有 domain");
      return;
    }

    // 按 user_id 分组
    const byUser = new Map();
    for (const row of result.rows) {
      if (!row.content) continue;
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id).push(row);
    }

    console.log(`👤 涉及 ${byUser.size} 个用户`);

    let totalUpdated = 0;
    const domainCounts = {};

    for (const [userId, records] of byUser) {
      // 查询该用户已有的 domain 列表
      const existingRes = await pool.query(
        `SELECT domain, count(*) as cnt FROM record
         WHERE user_id = $1 AND domain IS NOT NULL
         GROUP BY domain ORDER BY cnt DESC`,
        [userId],
      );
      const existingDomains = existingRes.rows.map((r) => r.domain);

      // 分批处理
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);

        const domainHint =
          existingDomains.length > 0
            ? `\n\n## 该用户已有分类（优先使用）\n${existingDomains.map((d) => `- ${d}`).join("\n")}`
            : "";

        const systemPrompt = `你是一个日记分类引擎。为每条日记判断它属于哪个分类。

规则：
- 分类用简短中文，如 "工作"、"生活"、"学习"、"健康"
- 可用路径表示子分类：如 "工作/产品" "生活/旅行"
- 优先使用已有分类名称保持一致
- 若内容太短或无法判断，domain 设为 null
${domainHint}

返回 JSON:
{
  "assignments": [
    {"id": "record-id", "domain": "工作"}
  ]
}`;

        const recordList = batch
          .map((r) => `- [${r.id}] ${r.content.slice(0, 200)}`)
          .join("\n");

        console.log(
          `\n🤖 用户 ${userId.slice(0, 8)}... 批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(records.length / BATCH_SIZE)} (${batch.length} 条)`,
        );

        try {
          const aiResp = await callAI([
            { role: "system", content: systemPrompt },
            { role: "user", content: `## 日记列表\n\n${recordList}` },
          ]);

          let parsed;
          try {
            parsed = JSON.parse(aiResp);
          } catch {
            // 尝试提取 JSON
            const match = aiResp.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
            else {
              console.error("  ❌ AI 返回非 JSON:", aiResp.slice(0, 300));
              continue;
            }
          }

          const assignments = parsed.assignments ?? [];
          const validIds = new Set(batch.map((r) => r.id));

          for (const a of assignments) {
            if (!validIds.has(a.id) || !a.domain) continue;
            domainCounts[a.domain] = (domainCounts[a.domain] || 0) + 1;

            if (!dryRun) {
              await pool.query(
                "UPDATE record SET domain = $1, updated_at = now() WHERE id = $2",
                [a.domain, a.id],
              );
            }
            totalUpdated++;

            // 更新已有 domain 列表
            if (!existingDomains.includes(a.domain)) {
              existingDomains.push(a.domain);
            }
          }

          console.log(`  ✅ 分配 ${assignments.length} 条`);
        } catch (err) {
          console.error(`  ❌ 批次失败: ${err.message}`);
        }

        // 请求间隔，避免限流
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log("\n📊 Domain 分布:");
    for (const [d, c] of Object.entries(domainCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${d}: ${c}`);
    }
    console.log(
      `\n🎉 共更新 ${totalUpdated} 条${dryRun ? " (dry-run)" : ""}`,
    );
  } catch (err) {
    console.error("❌ 失败:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
