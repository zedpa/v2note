/**
 * Goal 语义去重：将语义重复的目标合并
 *
 * 逻辑：
 * 1. 获取所有活跃 level>=1 的 todo（目标/项目）
 * 2. 一次 AI 调用识别语义重复分组
 * 3. 每组保留最早创建的，迁移子任务，归档重复项
 *
 * Usage: node scripts/repair-goal-dedup.mjs [--dry-run]
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
    // 1. 获取所有活跃目标（level>=1, 非归档/完成）
    const goalsResult = await pool.query(`
      SELECT id, text, level, domain, parent_id, status, created_at,
             (SELECT COUNT(*)::int FROM todo c WHERE c.parent_id = t.id AND c.level = 0) AS child_count
      FROM todo t
      WHERE level >= 1
        AND status NOT IN ('archived', 'completed', 'abandoned', 'dismissed')
      ORDER BY created_at ASC
    `);

    const goals = goalsResult.rows;
    console.log(`\n🎯 活跃目标: ${goals.length} 条`);

    if (goals.length <= 10) {
      console.log('✅ 目标数量已经很少，无需去重');
      return;
    }

    // 2. AI 识别语义重复分组
    const systemPrompt = `你是一个语义去重引擎。给定一组目标/项目，找出语义相同或高度相似的分组。

规则：
1. 只合并真正表达同一件事的目标（如"健康管理"和"保持健康"是同一件事）
2. 相关但不同的目标不要合并（如"学英语"和"考雅思"是不同的）
3. 大小写、标点、表述方式不同但含义相同的要合并
4. 一个目标只能属于一个分组
5. 不需要去重的目标不要列出

返回 JSON:
{
  "groups": [
    {
      "canonical": "最佳表述（简洁准确）",
      "ids": ["id1", "id2", "..."],
      "reason": "为什么这些是重复的（一句话）"
    }
  ],
  "summary": "总共发现 X 组重复，涉及 Y 个目标"
}`;

    const goalList = goals.map(g =>
      `- [${g.id}] "${g.text}" (level=${g.level}, domain=${g.domain ?? '无'}, children=${g.child_count}, status=${g.status})`
    ).join('\n');

    console.log(`\n🤖 调用 AI 识别语义重复...`);
    const aiResp = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `## 目标列表（${goals.length} 条）\n\n${goalList}` },
    ]);

    let result;
    try {
      result = JSON.parse(aiResp);
    } catch {
      console.error('❌ AI 返回非 JSON:', aiResp.slice(0, 500));
      return;
    }

    const groups = result.groups ?? [];
    console.log(`\n📊 ${result.summary || `发现 ${groups.length} 组重复`}`);

    if (groups.length === 0) {
      console.log('✅ 无语义重复，无需操作');
      return;
    }

    // 3. 逐组处理：保留最早+子任务最多的，迁移子任务，归档重复
    const goalMap = new Map(goals.map(g => [g.id, g]));
    let totalMerged = 0;
    let totalMigrated = 0;

    for (const group of groups) {
      const validIds = group.ids.filter(id => goalMap.has(id));
      if (validIds.length < 2) continue;

      console.log(`\n── 合并组: "${group.canonical}" (${group.reason})`);

      // 选择保留项：优先 child_count 最多，其次 created_at 最早
      const sorted = validIds
        .map(id => goalMap.get(id))
        .sort((a, b) => {
          if (b.child_count !== a.child_count) return b.child_count - a.child_count;
          return new Date(a.created_at) - new Date(b.created_at);
        });

      const keeper = sorted[0];
      const duplicates = sorted.slice(1);

      console.log(`  保留: [${keeper.id.slice(0, 8)}] "${keeper.text}" (${keeper.child_count} children)`);

      // 更新保留项的 text 为 canonical 表述（如果更好）
      if (group.canonical && group.canonical !== keeper.text && !dryRun) {
        await pool.query('UPDATE todo SET text = $1 WHERE id = $2', [group.canonical, keeper.id]);
        console.log(`  → 更新名称: "${keeper.text}" → "${group.canonical}"`);
      }

      for (const dup of duplicates) {
        console.log(`  归档: [${dup.id.slice(0, 8)}] "${dup.text}" (${dup.child_count} children)`);

        if (!dryRun) {
          // 迁移子任务到保留项
          if (dup.child_count > 0) {
            const migrated = await pool.query(
              'UPDATE todo SET parent_id = $1 WHERE parent_id = $2 RETURNING id',
              [keeper.id, dup.id]
            );
            totalMigrated += migrated.rowCount;
            console.log(`    → 迁移 ${migrated.rowCount} 个子任务`);
          }

          // 迁移子目标（level>=1 的子项）
          await pool.query(
            'UPDATE todo SET parent_id = $1 WHERE parent_id = $2 AND level >= 1',
            [keeper.id, dup.id]
          );

          // 归档重复项
          await pool.query(
            "UPDATE todo SET status = 'archived', done = true WHERE id = $1",
            [dup.id]
          );
        }

        totalMerged++;
      }
    }

    console.log(`\n🎉 结果: ${totalMerged} 个目标已归档合并, ${totalMigrated} 个子任务已迁移`);

    if (!dryRun) {
      // 最终统计
      const stats = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('active', 'progressing'))::int AS active,
          COUNT(*) FILTER (WHERE status = 'archived')::int AS archived,
          COUNT(*) FILTER (WHERE status = 'suggested')::int AS suggested
        FROM todo WHERE level >= 1
      `);
      console.log('\n📊 最终状态:');
      console.log(`  活跃: ${stats.rows[0].active}`);
      console.log(`  归档: ${stats.rows[0].archived}`);
      console.log(`  待确认: ${stats.rows[0].suggested}`);
    }

  } catch (err) {
    console.error('❌ 失败:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
