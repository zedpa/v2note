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

try {
  // Check cognitive layer tables exist
  const { rows } = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('strike', 'bond', 'strike_tag', 'cluster_member')
    ORDER BY table_name
  `);
  console.log('认知层表:', rows.map(r => r.table_name).join(', '));

  // Check record.digested column
  const { rows: cols } = await pool.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'record' AND column_name IN ('digested', 'digested_at')
  `);
  console.log('record 新列:', cols.map(c => `${c.column_name} (${c.data_type}, default: ${c.column_default})`).join(', '));

  // Check strike table columns
  const { rows: strikeCols } = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'strike' ORDER BY ordinal_position
  `);
  console.log('strike 列:', strikeCols.map(c => c.column_name).join(', '));

  console.log('\n✅ 所有认知层表已就绪');
} catch (err) {
  console.error('❌', err.message);
} finally {
  await pool.end();
}
