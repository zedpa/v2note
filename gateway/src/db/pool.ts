import pg from "pg";

const { Pool, types } = pg;

/** 可选的事务客户端类型 — 传入 PoolClient 则用该连接，undefined 走默认 pool */
export type Queryable = pg.PoolClient | undefined;

// Return DATE (OID 1082) as plain string "YYYY-MM-DD" instead of JS Date object
types.setTypeParser(1082, (val: string) => val);

// Return TIMESTAMPTZ (OID 1184) as ISO string with Z suffix instead of JS Date object.
// pg 返回格式如 "2026-04-11 22:00:00+08"，转为标准 ISO UTC "2026-04-11T14:00:00.000Z"。
// 这确保 JSON.stringify 不经过 Date 对象，前端收到的始终是 UTC ISO 字符串。
types.setTypeParser(1184, (val: string) => new Date(val).toISOString());

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
      max: 15,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on("connect", (client) => {
      client.query("SET statement_timeout = 10000; SET timezone = 'Asia/Shanghai'");
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
  client?: Queryable,
): Promise<T[]> {
  const executor = client ?? getPool();
  const { rows } = await executor.query<T>(sql, params);
  return rows;
}

/** Run a query and return the first row or null */
export async function queryOne<T extends Record<string, any>>(
  sql: string,
  params?: any[],
  client?: Queryable,
): Promise<T | null> {
  const rows = await query<T>(sql, params, client);
  return rows[0] ?? null;
}

/** Run an INSERT/UPDATE/DELETE and return affected row count */
export async function execute(sql: string, params?: any[], client?: Queryable): Promise<number> {
  const executor = client ?? getPool();
  const { rowCount } = await executor.query(sql, params);
  return rowCount ?? 0;
}
