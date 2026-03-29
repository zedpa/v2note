/**
 * Step 1a: 硬规则清理（无 AI）
 *
 * 清理规则：
 *   1. status='suggested' 且创建超过 14 天 → archive
 *   2. text 完全相同 → 保留最早的，其余 archive
 *   3. 无子 todo 且无 cluster_id → archive
 *   4. 被 archive 的记录的子 todo.parent_id 迁移到保留的同名记录
 *
 * Usage: node scripts/repair-goal-cleanup.mjs [--dry-run]
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

async function main() {
  const client = await pool.connect();
  try {
    // 统计当前 level>=1 的分布
    const before = await client.query(`
      SELECT status, COUNT(*)::int AS cnt
      FROM todo WHERE level >= 1
      GROUP BY status ORDER BY cnt DESC
    `);
    console.log('📊 清理前 level>=1 分布:');
    for (const r of before.rows) {
      console.log(`  ${r.status}: ${r.cnt}`);
    }

    if (dryRun) console.log('\n🔍 DRY RUN 模式\n');

    await client.query('BEGIN');

    let totalArchived = 0;

    // ── 规则 1: suggested 且超 14 天 ─────────────────────────────────
    const rule1 = await client.query(`
      SELECT id, text FROM todo
      WHERE level >= 1 AND status = 'suggested'
        AND created_at < NOW() - INTERVAL '14 days'
    `);
    console.log(`\n规则1: ${rule1.rows.length} 个 suggested 超 14 天`);

    if (!dryRun && rule1.rows.length > 0) {
      await client.query(`
        UPDATE todo SET status = 'archived'
        WHERE level >= 1 AND status = 'suggested'
          AND created_at < NOW() - INTERVAL '14 days'
      `);
    }
    totalArchived += rule1.rows.length;

    // ── 规则 2: text 完全相同 → 保留最早的 ──────────────────────────
    const dupes = await client.query(`
      SELECT text, array_agg(id ORDER BY created_at ASC) AS ids, COUNT(*)::int AS cnt
      FROM todo
      WHERE level >= 1 AND status NOT IN ('archived', 'completed', 'abandoned')
      GROUP BY text
      HAVING COUNT(*) > 1
    `);

    let rule2Count = 0;
    for (const d of dupes.rows) {
      const keepId = d.ids[0]; // 保留最早的
      const archiveIds = d.ids.slice(1);
      rule2Count += archiveIds.length;

      if (!dryRun) {
        // 迁移子 todo 到保留的记录
        await client.query(`
          UPDATE todo SET parent_id = $1
          WHERE parent_id = ANY($2) AND level = 0
        `, [keepId, archiveIds]);

        // archive 重复的
        await client.query(`
          UPDATE todo SET status = 'archived'
          WHERE id = ANY($1)
        `, [archiveIds]);
      }

      if (dryRun && dupes.rows.indexOf(d) < 5) {
        console.log(`  [DRY] "${d.text}" → 保留1个，archive ${archiveIds.length}个`);
      }
    }
    console.log(`规则2: ${rule2Count} 个重复名称 archive（${dupes.rows.length} 组重复）`);
    totalArchived += rule2Count;

    // ── 规则 3: 无子 todo 且无 cluster_id ─────────────────────────
    const rule3 = await client.query(`
      SELECT t.id, t.text FROM todo t
      WHERE t.level >= 1
        AND t.status NOT IN ('archived', 'completed', 'abandoned')
        AND t.cluster_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM todo child WHERE child.parent_id = t.id)
    `);
    console.log(`规则3: ${rule3.rows.length} 个无子todo且无cluster关联`);

    if (!dryRun && rule3.rows.length > 0) {
      const ids = rule3.rows.map(r => r.id);
      await client.query(`
        UPDATE todo SET status = 'archived'
        WHERE id = ANY($1)
      `, [ids]);
    }
    totalArchived += rule3.rows.length;

    if (dryRun) {
      console.log(`\n🔍 DRY RUN: 总计将 archive ${totalArchived} 条`);
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
      console.log(`\n🎉 清理完成: 共 archive ${totalArchived} 条`);
    }

    // 清理后统计
    const after = await client.query(`
      SELECT status, COUNT(*)::int AS cnt
      FROM todo WHERE level >= 1
      GROUP BY status ORDER BY cnt DESC
    `);
    console.log('\n📊 清理后 level>=1 分布:');
    for (const r of after.rows) {
      console.log(`  ${r.status}: ${r.cnt}`);
    }

    const activeCount = after.rows
      .filter(r => ['active', 'progressing'].includes(r.status))
      .reduce((s, r) => s + r.cnt, 0);
    console.log(`\n✨ 活跃目标数: ${activeCount}`);

  } catch (err) {
    console.error('❌ 清理失败:', err.message);
    await client.query('ROLLBACK').catch(() => {});
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
