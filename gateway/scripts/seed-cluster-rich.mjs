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

const CLUSTER_ID = '21325acd-0000-0000-0000-000000000000';
const USER_ID = '78856168-0000-0000-0000-000000000000';

async function main() {
  // 0. 确认 cluster 存在
  const { rows: [cluster] } = await pool.query(
    `SELECT id, nucleus, polarity FROM strike WHERE id::text LIKE $1 AND is_cluster = true`,
    ['21325acd%']
  );

  if (!cluster) {
    console.error('❌ Cluster starting with 21325acd not found');
    process.exit(1);
  }
  console.log(`Found cluster: ${cluster.id} — "${cluster.nucleus}" [${cluster.polarity}]`);

  // 确认 user_id
  const { rows: [user] } = await pool.query(
    `SELECT id FROM app_user WHERE id::text LIKE $1`,
    ['78856168%']
  );
  if (!user) {
    console.error('❌ User starting with 78856168 not found');
    process.exit(1);
  }
  const userId = user.id;
  console.log(`User: ${userId}`);

  // 1. 插入 5 个 strike 作为 cluster member
  const strikeDefs = [
    { nucleus: '供应商账期从 60 天压到 45 天，现金流会紧', polarity: 'perceive', confidence: 0.8 },
    { nucleus: '库存周转率比行业均值低 20%', polarity: 'judge', confidence: 0.7 },
    { nucleus: '数字化采购平台能降低 15% 人力成本', polarity: 'realize', confidence: 0.6 },
    { nucleus: '要在 Q3 前完成供应商分级', polarity: 'intend', confidence: 0.9 },
    { nucleus: '对现有 ERP 系统的可靠性感到不安', polarity: 'feel', confidence: 0.5 },
  ];

  const insertedStrikes = [];
  for (const def of strikeDefs) {
    const { rows: [s] } = await pool.query(
      `INSERT INTO strike (user_id, nucleus, polarity, confidence, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, nucleus, polarity`,
      [userId, def.nucleus, def.polarity, def.confidence]
    );
    insertedStrikes.push(s);
    console.log(`  + strike [${s.polarity}] ${s.nucleus}`);
  }

  // 2. 将 5 个 strike 加入 cluster_member
  for (const s of insertedStrikes) {
    await pool.query(
      `INSERT INTO cluster_member (cluster_strike_id, member_strike_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [cluster.id, s.id]
    );
  }
  console.log(`\n✅ Added ${insertedStrikes.length} strikes to cluster`);

  // 3. 创建 1 个 contradiction bond（第 1 个 strike 和第 4 个 strike 之间）
  const src = insertedStrikes[0]; // perceive: 账期压缩现金流紧
  const tgt = insertedStrikes[3]; // intend: Q3 前完成供应商分级
  const { rows: [bond] } = await pool.query(
    `INSERT INTO bond (source_strike_id, target_strike_id, type, strength, created_by)
     VALUES ($1, $2, 'contradiction', 0.75, 'seed')
     RETURNING id, type, strength`,
    [src.id, tgt.id]
  );
  console.log(`\n✅ Bond created: ${bond.id}`);
  console.log(`   ${src.polarity}: "${src.nucleus}"`);
  console.log(`   ←— ${bond.type} (${bond.strength}) —→`);
  console.log(`   ${tgt.polarity}: "${tgt.nucleus}"`);

  // 4. 打印最终 cluster 状态
  const { rows: members } = await pool.query(
    `SELECT s.id, s.nucleus, s.polarity, s.confidence
     FROM cluster_member cm
     JOIN strike s ON s.id = cm.member_strike_id
     WHERE cm.cluster_strike_id = $1
     ORDER BY s.created_at`,
    [cluster.id]
  );

  const { rows: bonds } = await pool.query(
    `SELECT b.id, b.type, b.strength,
            s1.nucleus AS src_nucleus, s2.nucleus AS tgt_nucleus
     FROM bond b
     JOIN strike s1 ON s1.id = b.source_strike_id
     JOIN strike s2 ON s2.id = b.target_strike_id
     WHERE b.source_strike_id = ANY($1) OR b.target_strike_id = ANY($1)`,
    [members.map(m => m.id)]
  );

  console.log(`\n========== Cluster Summary ==========`);
  console.log(`Cluster: ${cluster.id}`);
  console.log(`Nucleus: "${cluster.nucleus}"`);
  console.log(`Members: ${members.length}`);
  members.forEach((m, i) => {
    console.log(`  ${i + 1}. [${m.polarity}] ${m.nucleus} (confidence: ${m.confidence})`);
  });
  console.log(`\nBonds: ${bonds.length}`);
  bonds.forEach(b => {
    console.log(`  • ${b.type} (${b.strength}): "${b.src_nucleus.slice(0, 30)}…" ↔ "${b.tgt_nucleus.slice(0, 30)}…"`);
  });
  console.log(`=====================================`);
}

main().catch(console.error).finally(() => pool.end());
