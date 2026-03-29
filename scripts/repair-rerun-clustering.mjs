/**
 * Step 2c: 重跑全量聚类
 *
 * 直接调用 batch-analyze 逻辑，使用新的 Step A prompt（纯聚类）。
 * 分批处理：每批 100 个 Strike + 已有 Cluster 列表。
 *
 * Usage: node scripts/repair-rerun-clustering.mjs
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../gateway/node_modules/'));
const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: resolve(__dirname, '../gateway/.env') });

const GW = process.env.GW_URL || 'http://localhost:3001';

async function main() {
  const pool = new pg.Pool({
    host: process.env.RDS_HOST,
    port: parseInt(process.env.RDS_PORT ?? '5432'),
    database: process.env.RDS_DATABASE,
    user: process.env.RDS_USER,
    password: process.env.RDS_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // 获取用户信息
    const user = await pool.query('SELECT id FROM app_user LIMIT 1');
    const userId = user.rows[0].id;
    console.log('User:', userId);

    // 触发 batch-analyze（通过 gateway API）
    console.log('\n🚀 触发 batch-analyze...');
    console.log('这会使用新的 Step A prompt（纯聚类），预计需要 1-2 分钟。\n');

    const resp = await fetch(`${GW}/api/v1/cognitive/batch-analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': '00000000-0000-0000-0000-000000000000',
        'x-user-id': userId,
      },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(180000), // 3 min timeout
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('❌ API 调用失败:', resp.status, text);

      // 如果 API 不存在，直接用 gateway 代码
      console.log('\n尝试直接调用...');
      await directCall(userId, pool);
      return;
    }

    const result = await resp.json();
    console.log('✅ batch-analyze 结果:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('API 调用出错:', err.message);
    console.log('\n尝试直接调用...');

    const user = await pool.query('SELECT id FROM app_user LIMIT 1');
    await directCall(user.rows[0].id, pool);
  } finally {
    await pool.end();
  }
}

async function directCall(userId, pool) {
  // 直接用 SQL 检查结果
  console.log('\n📊 当前聚类状态:');
  const clusters = await pool.query(`
    SELECT s.id, s.nucleus, s.domain, COUNT(b.id)::int AS member_count
    FROM strike s
    LEFT JOIN bond b ON b.source_strike_id=s.id AND b.type='cluster_member'
    WHERE s.is_cluster=true AND s.status='active'
    GROUP BY s.id, s.nucleus, s.domain
    ORDER BY member_count DESC
  `);

  if (clusters.rows.length === 0) {
    console.log('  无活跃 Cluster（需要通过 gateway 触发 batch-analyze）');
    console.log('\n💡 请确保 gateway 正在运行，然后重新执行本脚本。');
    console.log('   或者手动触发: curl -X POST http://localhost:3001/api/v1/cognitive/batch-analyze');
  } else {
    clusters.rows.forEach(r => {
      console.log(`  ${r.nucleus.slice(0, 50)} → ${r.member_count} 成员 ${r.domain ? '@' + r.domain : ''}`);
    });
  }

  // 覆盖率
  const coverage = await pool.query(`
    SELECT
      (SELECT COUNT(DISTINCT target_strike_id)::int FROM bond WHERE type='cluster_member') AS clustered,
      (SELECT COUNT(*)::int FROM strike WHERE is_cluster=false AND status='active') AS total
  `);
  const { clustered, total } = coverage.rows[0];
  console.log(`\n覆盖率: ${clustered}/${total} = ${((clustered / total) * 100).toFixed(1)}%`);
}

main();
