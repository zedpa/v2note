/**
 * 为没有 domain 的目标和待办分配 domain
 *
 * 一次 AI 调用：所有无 domain 的 level>=1 目标 + level=0 待办
 * AI 返回每个 todo 的 domain 分类
 *
 * Usage: node scripts/repair-assign-domain.mjs [--dry-run]
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../gateway/node_modules/'));
const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: resolve(__dirname, '../gateway/.env') });

const dryRun = process.argv.includes('--dry-run');

const pool = new pg.Pool({
  host: process.env.RDS_HOST,
  port: parseInt(process.env.RDS_PORT ?? '5432'),
  database: process.env.RDS_DATABASE,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function callAI(messages) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = process.env.AI_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const model = process.env.AI_MODEL ?? 'qwen3.5-plus';

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(300000),
  });

  if (!resp.ok) throw new Error(`AI API error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.choices[0].message.content;
}

async function main() {
  try {
    // 获取无 domain 的所有 todo（包括目标和待办）
    const result = await pool.query(`
      SELECT id, text, level, status
      FROM todo
      WHERE domain IS NULL
        AND status NOT IN ('archived', 'completed', 'abandoned', 'dismissed')
        AND done = false
      ORDER BY level DESC, created_at DESC
    `);

    console.log(`\n📋 无 domain 的 todo: ${result.rows.length} 条`);
    if (result.rows.length === 0) {
      console.log('✅ 所有 todo 已有 domain，无需操作');
      return;
    }

    const goals = result.rows.filter(r => r.level >= 1);
    const actions = result.rows.filter(r => r.level === 0);
    console.log(`  目标: ${goals.length}, 待办: ${actions.length}`);

    // AI 分类
    const systemPrompt = `你是一个分类引擎。将每个项目分配到最合适的生活维度。

可用维度：工作、生活、学习、健康、社交、投资

规则：
1. 产品开发、代码、推广、创业 → 工作
2. 家务、购物、日常事务 → 生活
3. 读书、课程、技能提升 → 学习
4. 健身、医疗、饮食 → 健康
5. 朋友、家人、社交活动 → 社交
6. 理财、股票、房产 → 投资
7. 如果一个项目确实无法归类，使用 "生活" 作为默认

返回 JSON:
{
  "assignments": [
    {"id": "xxx", "domain": "工作"}
  ]
}`;

    const todoList = result.rows.map(r =>
      `- [${r.id}] "${r.text}" (level=${r.level})`
    ).join('\n');

    console.log('\n🤖 调用 AI 分类...');
    const aiResp = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `## 项目列表（${result.rows.length} 条）\n\n${todoList}` },
    ]);

    let parsed;
    try {
      parsed = JSON.parse(aiResp);
    } catch {
      console.error('❌ AI 返回非 JSON:', aiResp.slice(0, 500));
      return;
    }

    const assignments = parsed.assignments ?? [];
    console.log(`\n📊 AI 返回 ${assignments.length} 条分配`);

    // 验证并更新
    const validIds = new Set(result.rows.map(r => r.id));
    const validDomains = new Set(['工作', '生活', '学习', '健康', '社交', '投资']);
    let updated = 0;
    const domainCounts = {};

    for (const a of assignments) {
      if (!validIds.has(a.id)) continue;
      const domain = validDomains.has(a.domain) ? a.domain : '生活';
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;

      if (!dryRun) {
        await pool.query('UPDATE todo SET domain = $1 WHERE id = $2', [domain, a.id]);
      }
      updated++;
    }

    console.log('\n📊 Domain 分布:');
    for (const [d, c] of Object.entries(domainCounts)) {
      console.log(`  ${d}: ${c}`);
    }
    console.log(`\n🎉 已更新 ${updated} 条${dryRun ? ' (dry-run)' : ''}`);

    // 同步：子 todo 继承 parent 目标的 domain
    if (!dryRun) {
      const inherited = await pool.query(`
        UPDATE todo child
        SET domain = parent.domain
        FROM todo parent
        WHERE child.parent_id = parent.id
          AND child.domain IS NULL
          AND parent.domain IS NOT NULL
        RETURNING child.id
      `);
      console.log(`📎 ${inherited.rowCount} 个子待办继承了父目标的 domain`);
    }

  } catch (err) {
    console.error('❌ 失败:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
