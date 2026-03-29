/**
 * Step 3a: 存量 Todo→目标 批量关联
 *
 * 一次 AI 调用：所有 level=0 的未关联 todo + 所有 active level>=1 目标
 * AI 返回每个 todo 应归属哪个目标（parent_id），无匹配返回 null。
 *
 * Usage: node scripts/repair-todo-parent-link.mjs [--dry-run]
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
      temperature: 0.2,
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
    // 获取未关联的 level=0 todo
    const todos = await pool.query(`
      SELECT id, text FROM todo
      WHERE level = 0 AND parent_id IS NULL AND done = false
      ORDER BY created_at DESC
    `);
    console.log(`📋 未关联的 todo: ${todos.rows.length} 条`);

    if (todos.rows.length === 0) {
      console.log('✅ 所有 todo 已关联，无需操作');
      return;
    }

    // 获取活跃目标
    const goals = await pool.query(`
      SELECT id, text, domain FROM todo
      WHERE level >= 1 AND status IN ('active', 'progressing')
      ORDER BY created_at DESC
    `);
    console.log(`🎯 活跃目标: ${goals.rows.length} 条`);

    if (goals.rows.length === 0) {
      console.log('⚠️  无活跃目标，无法关联');
      return;
    }

    // 构建 prompt
    const systemPrompt = `你是一个任务分类引擎。给定一组待办事项和一组目标，判断每个待办最可能属于哪个目标。

规则：
1. 每个待办只能归属��个目标（选最相关的）
2. 如果待办和所有目标都不相关，返回 null
3. 不要强行关联——"买地黄丸"和"产品设计"无关就是无关
4. 同时为每个待办判断最匹配的 domain（维度），从目标的 domain 继承

返回 JSON:
{
  "links": [
    {"todo_id": "xxx", "goal_id": "yyy 或 null", "domain": "工作 或 null"}
  ]
}`;

    const userContent = [
      '## 目标列表',
      ...goals.rows.map(g => `- [${g.id}] "${g.text}" ${g.domain ? '@' + g.domain : ''}`),
      '',
      '## 待办列表（为每个判断归属目标）',
      ...todos.rows.map(t => `- [${t.id}] "${t.text}"`),
    ].join('\n');

    console.log(`\n🤖 调用 AI 进行匹配...`);
    const aiResp = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]);

    let result;
    try {
      result = JSON.parse(aiResp);
    } catch {
      console.error('❌ AI 返回非 JSON:', aiResp.slice(0, 500));
      return;
    }

    const links = result.links ?? [];
    console.log(`\n📊 AI 返回 ${links.length} 条匹配结果`);

    // 验证 goal_id 存在
    const goalIds = new Set(goals.rows.map(g => g.id));
    const todoIds = new Set(todos.rows.map(t => t.id));

    let linked = 0;
    let skipped = 0;
    let domainUpdated = 0;

    for (const link of links) {
      if (!todoIds.has(link.todo_id)) continue;

      if (link.goal_id && goalIds.has(link.goal_id)) {
        if (dryRun) {
          const todo = todos.rows.find(t => t.id === link.todo_id);
          const goal = goals.rows.find(g => g.id === link.goal_id);
          console.log(`  [DRY] "${todo?.text?.slice(0, 30)}" → "${goal?.text?.slice(0, 30)}"`);
        } else {
          await pool.query(
            'UPDATE todo SET parent_id = $1, domain = $2 WHERE id = $3',
            [link.goal_id, link.domain ?? null, link.todo_id]
          );
        }
        linked++;
      } else {
        // 无目标匹配，但可能有 domain
        if (link.domain && !dryRun) {
          await pool.query(
            'UPDATE todo SET domain = $1 WHERE id = $2 AND domain IS NULL',
            [link.domain, link.todo_id]
          );
          domainUpdated++;
        }
        skipped++;
      }
    }

    console.log(`\n🎉 结果: ${linked} 关联, ${skipped} 无匹配, ${domainUpdated} domain 更新`);

    if (!dryRun) {
      // 最终统计
      const stats = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE parent_id IS NOT NULL)::int AS linked,
          COUNT(*) FILTER (WHERE parent_id IS NULL)::int AS unlinked,
          COUNT(*) FILTER (WHERE domain IS NOT NULL)::int AS has_domain
        FROM todo WHERE level = 0 AND done = false
      `);
      console.log('\n📊 最终状态:');
      console.log(`  有 parent: ${stats.rows[0].linked}`);
      console.log(`  无 parent: ${stats.rows[0].unlinked}`);
      console.log(`  有 domain: ${stats.rows[0].has_domain}`);
    }

  } catch (err) {
    console.error('❌ 失败:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
