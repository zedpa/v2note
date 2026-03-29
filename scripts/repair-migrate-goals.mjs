/**
 * Goal → Todo 迁移脚本
 *
 * 将 goal 表数据迁入 todo 表（level>=1），处理 parent_id 映射。
 *
 * 执行顺序：
 *   1. 先运行 036_unified_task_model.sql migration
 *   2. 再运行本脚本
 *
 * Usage: node scripts/repair-migrate-goals.mjs [--dry-run]
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// pg 安装在 gateway/node_modules，需要指定 require 路径
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
    // 检查 goal 表是否存在
    const tableCheck = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goal')`
    );
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  goal 表不存在，无需迁移');
      return;
    }

    // 统计
    const goalCount = await client.query('SELECT COUNT(*)::int AS cnt FROM goal');
    console.log(`📊 Goal 表总数: ${goalCount.rows[0].cnt}`);

    const todoGoalCount = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM todo WHERE goal_id IS NOT NULL`
    );
    console.log(`📊 已有 goal_id 的 todo: ${todoGoalCount.rows[0].cnt}`);

    // 检查是否已经迁移过（todo 表中有 level>=1 的记录）
    const alreadyMigrated = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM todo WHERE level >= 1`
    );
    if (alreadyMigrated.rows[0].cnt > 0) {
      console.log(`⚠️  todo 表中已有 ${alreadyMigrated.rows[0].cnt} 条 level>=1 记录，可能已迁移过`);
      console.log('如需重新迁移，请先清理这些记录');
      return;
    }

    if (dryRun) {
      console.log('\n🔍 DRY RUN 模式，不会执行写操作\n');
    }

    await client.query('BEGIN');

    // ── 第一步：将 goal 数据 INSERT INTO todo ──────────────────────

    // domain 值映射（英文→中文）
    const domainMap = {
      'work': '工作',
      'life': '生活',
      'health': '健康',
      'study': '学习',
      'finance': '投资',
    };

    const goals = await client.query(
      `SELECT g.*,
              CASE WHEN g.parent_id IS NOT NULL AND p.id IS NOT NULL THEN 2 ELSE 1 END AS target_level
       FROM goal g
       LEFT JOIN goal p ON g.parent_id = p.id
       ORDER BY g.created_at ASC`
    );

    console.log(`\n📦 开始迁移 ${goals.rows.length} 个 goal...`);

    // goal.id → new todo.id 映射
    const idMap = new Map();

    for (const g of goals.rows) {
      const done = g.status === 'completed';
      const status = g.status ?? 'active';

      if (dryRun) {
        console.log(`  [DRY] Would INSERT: "${g.title}" level=${g.target_level} status=${status}`);
        idMap.set(g.id, `dry-${g.id}`);
        continue;
      }

      const result = await client.query(
        `INSERT INTO todo (user_id, device_id, text, level, status, done, cluster_id, created_at, domain)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          g.user_id,
          g.device_id,
          g.title,
          g.target_level,
          status,
          done,
          g.cluster_id ?? null,
          g.created_at,
          null, // domain 后续 batch-analyze 时 AI 分配
        ]
      );

      idMap.set(g.id, result.rows[0].id);
    }

    console.log(`✅ 第一步完成：${idMap.size} 个 goal 已插入 todo 表`);

    // ── 第二步：处理 goal 之间的 parent_id（项目→子目标）──────────

    let goalParentUpdated = 0;
    for (const g of goals.rows) {
      if (!g.parent_id) continue;
      const newId = idMap.get(g.id);
      const newParentId = idMap.get(g.parent_id);
      if (!newId || !newParentId) continue;

      if (dryRun) {
        console.log(`  [DRY] Would SET parent: "${g.title}" → parent goal`);
        goalParentUpdated++;
        continue;
      }

      await client.query(
        `UPDATE todo SET parent_id = $1 WHERE id = $2`,
        [newParentId, newId]
      );
      goalParentUpdated++;
    }

    console.log(`✅ 第二步完成：${goalParentUpdated} 个 goal 间 parent_id 已映射`);

    // ── 第三步：处理 todo 原有的 goal_id（待办→目标）──────────────

    const todosWithGoal = await client.query(
      `SELECT id, goal_id, parent_id FROM todo WHERE goal_id IS NOT NULL AND level = 0`
    );

    let todoParentUpdated = 0;
    for (const t of todosWithGoal.rows) {
      // 已有 parent_id（subtask）的不覆盖
      if (t.parent_id) continue;

      const newParentId = idMap.get(t.goal_id);
      if (!newParentId) continue;

      if (dryRun) {
        console.log(`  [DRY] Would SET todo parent: ${t.id} → ${newParentId}`);
        todoParentUpdated++;
        continue;
      }

      await client.query(
        `UPDATE todo SET parent_id = $1 WHERE id = $2`,
        [newParentId, t.id]
      );
      todoParentUpdated++;
    }

    console.log(`✅ 第三步完成：${todoParentUpdated} 个 todo 的 goal_id 已转为 parent_id`);

    // ── 第四步：domain 值统一为中文 ─────────────────────────────────

    let domainUpdated = 0;
    for (const [en, zh] of Object.entries(domainMap)) {
      if (dryRun) {
        const cnt = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM todo WHERE domain = $1`, [en]
        );
        if (cnt.rows[0].cnt > 0) {
          console.log(`  [DRY] Would update domain: "${en}" → "${zh}" (${cnt.rows[0].cnt} rows)`);
          domainUpdated += cnt.rows[0].cnt;
        }
        continue;
      }

      const result = await client.query(
        `UPDATE todo SET domain = $1 WHERE domain = $2`,
        [zh, en]
      );
      domainUpdated += result.rowCount ?? 0;
    }

    if (domainUpdated > 0) {
      console.log(`✅ 第四步完成：${domainUpdated} 条 todo 的 domain 已转为中文`);
    } else {
      console.log(`ℹ️  第四步：无需 domain 转换`);
    }

    if (dryRun) {
      console.log('\n🔍 DRY RUN 完成，回滚事务');
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
      console.log('\n🎉 迁移完成！');
    }

    // 统计结果
    if (!dryRun) {
      const stats = await client.query(`
        SELECT level, status, COUNT(*)::int AS cnt
        FROM todo
        WHERE level >= 1
        GROUP BY level, status
        ORDER BY level, status
      `);
      console.log('\n📊 迁移后 level>=1 统计:');
      for (const r of stats.rows) {
        console.log(`  level=${r.level} status=${r.status}: ${r.cnt}`);
      }

      const linkedTodos = await client.query(`
        SELECT COUNT(*)::int AS cnt FROM todo WHERE parent_id IS NOT NULL AND level = 0
      `);
      console.log(`\n📊 有 parent_id 的 level=0 todo: ${linkedTodos.rows[0].cnt}`);
    }

  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
    await client.query('ROLLBACK').catch(() => {});
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
