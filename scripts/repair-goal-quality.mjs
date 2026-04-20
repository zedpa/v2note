/**
 * Goal 质量审查（AI 辅助）：语义去重 + 口语化降级
 *
 * 合并原 repair-goal-dedup.mjs 的功能，一次 AI 调用同时完成：
 * 1. 语义重复分组（如"健康管理"和"保持健康"）→ 合并
 * 2. 逐条判断是否为长期目标 → keep / downgrade_to_todo / dismiss
 *
 * Usage: node scripts/repair-goal-quality.mjs [--dry-run]
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
    // 1. 获取所有活跃目标（level>=1, 非完成/废弃/清退）
    const goalsResult = await pool.query(`
      SELECT id, text, level, parent_id, status, created_at,
             (SELECT COUNT(*)::int FROM todo c WHERE c.parent_id = t.id AND c.level = 0) AS child_count
      FROM todo t
      WHERE level >= 1
        AND done = false
        AND status NOT IN ('completed', 'abandoned', 'dismissed')
      ORDER BY created_at ASC
    `);

    const goals = goalsResult.rows;
    console.log(`\n🎯 活跃目标: ${goals.length} 条`);

    if (goals.length === 0) {
      console.log('✅ 无活跃目标');
      return;
    }

    // 2. 一次 AI 调用：语义去重 + 质量分类
    const systemPrompt = `你是目标质量审查引擎。给定一组目标/项目，执行两个任务：

## 任务 1: 语义去重
找出语义相同或高度相似的分组。
规则：
- 只合并真正表达同一件事的目标（如"健康管理"和"保持健康"是同一件事）
- 相关但不同的目标不要合并（如"学英语"和"考雅思"是不同的）
- 一个目标只能属于一个分组

## 任务 2: 质量分类
对每个目标判断是否为"长期目标"：
- **keep**: 持续性意图，需多步/多日完成，可衡量进展（如"学英语""减肥""完成毕业论文"）
- **downgrade_to_todo**: 一次性动作，有明确截止点，当天可完成（如"去取快递""买菜""下午开会"）
- **dismiss**: 情绪表达，非行动项（如"好累啊""今天好开心""天气真好"）

返回 JSON:
{
  "dedup_groups": [
    {
      "canonical": "最佳表述（简洁准确）",
      "ids": ["id1", "id2"],
      "reason": "合并原因"
    }
  ],
  "classifications": [
    {
      "id": "goal-id",
      "action": "keep" | "downgrade_to_todo" | "dismiss",
      "reason": "分类理由（一句话）"
    }
  ],
  "summary": "简短总结"
}

注意：
- dedup_groups 中的 id 在 classifications 中不要重复列出（去重组只列 canonical）
- 不确定的默认 keep（宁可保留，不要误删）`;

    const goalList = goals.map(g =>
      `- [${g.id}] "${g.text}" (level=${g.level}, children=${g.child_count}, status=${g.status})`
    ).join('\n');

    console.log(`\n🤖 调用 AI 进行质量审查...`);
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

    console.log(`\n📊 ${result.summary || '审查完成'}`);

    const goalMap = new Map(goals.map(g => [g.id, g]));
    let totalMerged = 0;
    let totalDowngraded = 0;
    let totalDismissed = 0;

    // ── 处理语义去重 ──
    const dedupGroups = result.dedup_groups ?? [];
    if (dedupGroups.length > 0) {
      console.log(`\n═══ 语义去重: ${dedupGroups.length} 组 ═══`);
    }

    for (const group of dedupGroups) {
      const validIds = group.ids.filter(id => goalMap.has(id));
      if (validIds.length < 2) continue;

      console.log(`\n  合并组: "${group.canonical}" — ${group.reason}`);

      // 保留 child_count 最多 + 最早的
      const sorted = validIds
        .map(id => goalMap.get(id))
        .sort((a, b) => {
          if (b.child_count !== a.child_count) return b.child_count - a.child_count;
          return new Date(a.created_at) - new Date(b.created_at);
        });

      const keeper = sorted[0];
      const duplicates = sorted.slice(1);

      console.log(`    保留: "${keeper.text}" (${keeper.child_count} children)`);

      if (!dryRun) {
        // 更新保留项名称为 canonical
        if (group.canonical && group.canonical !== keeper.text) {
          await pool.query('UPDATE todo SET text = $1, updated_at = now() WHERE id = $2', [group.canonical, keeper.id]);
        }

        for (const dup of duplicates) {
          // 迁移子任务
          if (dup.child_count > 0) {
            await pool.query(
              'UPDATE todo SET parent_id = $1, updated_at = now() WHERE parent_id = $2',
              [keeper.id, dup.id]
            );
          }
          // 清退
          await pool.query(
            "UPDATE todo SET status = 'dismissed', done = true, updated_at = now() WHERE id = $1",
            [dup.id]
          );
          // 归档关联 wiki_page
          await pool.query(
            "UPDATE wiki_page SET status = 'archived', updated_at = now() WHERE id = (SELECT wiki_page_id FROM todo WHERE id = $1) AND status = 'active'",
            [dup.id]
          );
          totalMerged++;
          console.log(`    清退: "${dup.text}"`);
        }
      } else {
        duplicates.forEach(dup => console.log(`    [DRY] 清退: "${dup.text}"`));
        totalMerged += duplicates.length;
      }
    }

    // ── 处理质量分类 ──
    const classifications = result.classifications ?? [];
    const downgrades = classifications.filter(c => c.action === 'downgrade_to_todo');
    const dismissals = classifications.filter(c => c.action === 'dismiss');

    if (downgrades.length > 0) {
      console.log(`\n═══ 降级为普通待办: ${downgrades.length} 条 ═══`);
      for (const item of downgrades) {
        const goal = goalMap.get(item.id);
        if (!goal) continue;
        console.log(`  "${goal.text}" — ${item.reason}`);

        if (!dryRun) {
          await pool.query(
            'UPDATE todo SET level = 0, updated_at = now() WHERE id = $1',
            [item.id]
          );
          // 归档关联 wiki_page（降级后不再需要目标 page）
          await pool.query(
            "UPDATE wiki_page SET status = 'archived', updated_at = now() WHERE id = (SELECT wiki_page_id FROM todo WHERE id = $1) AND status = 'active'",
            [item.id]
          );
        }
        totalDowngraded++;
      }
    }

    if (dismissals.length > 0) {
      console.log(`\n═══ 清退（非行动项）: ${dismissals.length} 条 ═══`);
      for (const item of dismissals) {
        const goal = goalMap.get(item.id);
        if (!goal) continue;
        console.log(`  "${goal.text}" — ${item.reason}`);

        if (!dryRun) {
          await pool.query(
            "UPDATE todo SET status = 'dismissed', done = true, updated_at = now() WHERE id = $1",
            [item.id]
          );
          await pool.query(
            "UPDATE wiki_page SET status = 'archived', updated_at = now() WHERE id = (SELECT wiki_page_id FROM todo WHERE id = $1) AND status = 'active'",
            [item.id]
          );
        }
        totalDismissed++;
      }
    }

    // ── 总结 ──
    console.log(`\n🎉 结果${dryRun ? ' (DRY RUN)' : ''}:`);
    console.log(`  语义合并: ${totalMerged} 条清退`);
    console.log(`  降级为待办: ${totalDowngraded} 条`);
    console.log(`  清退（非行动项）: ${totalDismissed} 条`);

    if (!dryRun) {
      const stats = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE done = false AND status IN ('active', 'progressing'))::int AS active,
          COUNT(*) FILTER (WHERE status = 'dismissed')::int AS dismissed,
          COUNT(*) FILTER (WHERE status = 'suggested')::int AS suggested
        FROM todo WHERE level >= 1
      `);
      console.log('\n📊 最终状态:');
      console.log(`  活跃: ${stats.rows[0].active}`);
      console.log(`  清退: ${stats.rows[0].dismissed}`);
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
