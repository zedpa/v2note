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

const OLD_USER = '4903c302-ceb8-42a0-ae3c-200ddc878209';
const NEW_USER = '78856168-80c0-4493-9487-8c4f5a58a1b6';

async function main() {
  const { rowCount } = await pool.query(
    `UPDATE strike SET user_id = $1 WHERE user_id = $2`,
    [NEW_USER, OLD_USER]
  );
  console.log(`Updated ${rowCount} row(s) in strike: user_id ${OLD_USER} -> ${NEW_USER}`);
}

main().catch(console.error).finally(() => pool.end());
