import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const pool = new pg.Pool({
  host: process.env.RDS_HOST,
  port: parseInt(process.env.RDS_PORT ?? '5432'),
  database: process.env.RDS_DATABASE,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  // 1. 找一个有 active strike 的 user_id
  const { rows: users } = await pool.query(
    `SELECT user_id, COUNT(*) AS cnt FROM strike
     WHERE status = 'active' AND is_cluster = false
     GROUP BY user_id
     ORDER BY cnt DESC LIMIT 1`
  );

  if (users.length === 0) {
    console.error('❌ No user with active strikes found');
    process.exit(1);
  }

  const userId = users[0].user_id;
  console.log(`Found user ${userId} with ${users[0].cnt} active strikes`);

  // 2. 查该用户所有 active strike 的 id
  const { rows: strikes } = await pool.query(
    `SELECT id, nucleus, polarity FROM strike
     WHERE user_id = $1 AND status = 'active' AND is_cluster = false
     ORDER BY created_at DESC`,
    [userId]
  );

  console.log(`Active strikes: ${strikes.length}`);

  // 3. 如果 >= 3 个，创建 cluster strike
  if (strikes.length < 3) {
    console.error(`❌ Only ${strikes.length} active strikes, need at least 3`);
    process.exit(1);
  }

  const { rows: [cluster] } = await pool.query(
    `INSERT INTO strike (user_id, nucleus, polarity, is_cluster, status)
     VALUES ($1, '供应链管理', 'perceive', true, 'active')
     RETURNING id, nucleus`,
    [userId]
  );

  console.log(`\nCreated cluster strike: ${cluster.id} — "${cluster.nucleus}"`);

  // 4. 把前 5 个 strike 加入 cluster_member
  const members = strikes.slice(0, 5);
  for (const m of members) {
    await pool.query(
      `INSERT INTO cluster_member (cluster_strike_id, member_strike_id)
       VALUES ($1, $2)`,
      [cluster.id, m.id]
    );
    console.log(`  + [${m.polarity}] ${m.nucleus.slice(0, 50)}`);
  }

  // 5. 打印结果
  const { rows: result } = await pool.query(
    `SELECT s.id, s.nucleus, COUNT(cm.member_strike_id)::int AS member_count
     FROM strike s
     LEFT JOIN cluster_member cm ON cm.cluster_strike_id = s.id
     WHERE s.id = $1
     GROUP BY s.id, s.nucleus`,
    [cluster.id]
  );

  console.log(`\n✅ Cluster "${result[0].nucleus}" created with ${result[0].member_count} members`);
}

main().catch(console.error).finally(() => pool.end());
