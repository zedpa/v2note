import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const host = process.env.RDS_HOST;
    const database = process.env.RDS_DATABASE;
    const user = process.env.RDS_USER;
    const password = process.env.RDS_PASSWORD;
    if (!host || !database || !user || !password) {
      throw new Error("Missing RDS_HOST, RDS_DATABASE, RDS_USER, or RDS_PASSWORD");
    }
    pool = new Pool({
      host,
      port: parseInt(process.env.RDS_PORT ?? "5432", 10),
      database,
      user,
      password,
      ssl: process.env.RDS_SSL === "true" ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (err) => {
      console.error("[db] Unexpected pool error:", err);
    });
  }
  return pool;
}

/** Run a query and return all rows typed as T */
export async function query<T extends Record<string, any>>(
  sql: string,
  params?: any[],
): Promise<T[]> {
  const { rows } = await getPool().query<T>(sql, params);
  return rows;
}

/** Run a query and return the first row or null */
export async function queryOne<T extends Record<string, any>>(
  sql: string,
  params?: any[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Run an INSERT/UPDATE/DELETE and return affected row count */
export async function execute(sql: string, params?: any[]): Promise<number> {
  const { rowCount } = await getPool().query(sql, params);
  return rowCount ?? 0;
}
