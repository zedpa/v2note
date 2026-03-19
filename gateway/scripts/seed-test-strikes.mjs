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
  // Find a recent completed record
  const { rows: records } = await pool.query(
    `SELECT r.id, r.user_id FROM record r 
     WHERE r.status = 'completed' AND r.user_id IS NOT NULL 
     ORDER BY r.created_at DESC LIMIT 1`
  );
  
  if (records.length === 0) {
    console.error('❌ No completed records found');
    process.exit(1);
  }

  const { id: recordId, user_id: userId } = records[0];
  console.log(`Seeding strikes for record ${recordId} (user: ${userId})`);

  // Check if strikes already exist
  const { rows: existing } = await pool.query(
    `SELECT COUNT(*) as count FROM strike WHERE source_id = $1`, [recordId]
  );
  if (parseInt(existing[0].count) > 0) {
    console.log(`Already has ${existing[0].count} strikes, skipping`);
    process.exit(0);
  }

  // Insert test strikes
  const strikes = [
    { nucleus: '和张总开了会讨论供应链问题', polarity: 'perceive', confidence: 0.9, tags: ['张总', '供应链', '会议'] },
    { nucleus: '原材料涨了15%，主要是铝和铜（张总说的）', polarity: 'perceive', confidence: 0.8, tags: ['原材料', '成本'] },
    { nucleus: '我认为应该考虑换供应商', polarity: 'judge', confidence: 0.6, tags: ['供应商', '决策'] },
    { nucleus: '老王反对换供应商，认为风险太大、质量难保证', polarity: 'perceive', confidence: 0.7, tags: ['老王', '供应商'] },
    { nucleus: '让小李做成本对比分析，下周三之前给结果', polarity: 'intend', confidence: 0.9, tags: ['小李', '成本分析'] },
    { nucleus: '对Q2利润率被拉低感到焦虑', polarity: 'feel', confidence: 0.7, tags: ['情绪', '利润'] },
    { nucleus: '意识到供应链管理是系统性短板，不能每次临时应对', polarity: 'realize', confidence: 0.8, tags: ['供应链', '管理'] },
  ];

  const strikeIds = [];
  for (const s of strikes) {
    const { rows: [row] } = await pool.query(
      `INSERT INTO strike (user_id, nucleus, polarity, source_id, confidence, source_type)
       VALUES ($1, $2, $3, $4, $5, 'voice') RETURNING id`,
      [userId, s.nucleus, s.polarity, recordId, s.confidence]
    );
    strikeIds.push(row.id);
    
    // Insert tags
    for (const tag of s.tags) {
      await pool.query(
        `INSERT INTO strike_tag (strike_id, label) VALUES ($1, $2)`,
        [row.id, tag]
      );
    }
    console.log(`  [${s.polarity}] ${s.nucleus.slice(0, 40)}... (${s.tags.join(', ')})`);
  }

  // Insert bonds
  const bonds = [
    { source: 1, target: 2, type: 'causal', strength: 0.8 },      // 涨价 → 换供应商想法
    { source: 2, target: 3, type: 'perspective_of', strength: 0.7 }, // 我的观点 vs 老王的
    { source: 4, target: 2, type: 'resolves', strength: 0.6 },      // 成本对比为了验证
    { source: 5, target: 1, type: 'causal', strength: 0.7 },        // 涨价导致焦虑
    { source: 6, target: 0, type: 'context_of', strength: 0.5 },    // 领悟来自于会议
  ];

  for (const b of bonds) {
    await pool.query(
      `INSERT INTO bond (source_strike_id, target_strike_id, type, strength)
       VALUES ($1, $2, $3, $4)`,
      [strikeIds[b.source], strikeIds[b.target], b.type, b.strength]
    );
  }

  // Mark record as digested
  await pool.query(
    `UPDATE record SET digested = true, digested_at = now() WHERE id = $1`,
    [recordId]
  );

  console.log(`\n✅ Seeded ${strikes.length} strikes + ${bonds.length} bonds for record ${recordId}`);
}

main().catch(console.error).finally(() => pool.end());
