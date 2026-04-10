import pg from "pg";
const { Pool, types } = pg;
// Return DATE (OID 1082) as plain string "YYYY-MM-DD" instead of JS Date object
types.setTypeParser(1082, (val) => val);
let pool = null;
export function getPool() {
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
export async function query(sql, params) {
    const { rows } = await getPool().query(sql, params);
    return rows;
}
/** Run a query and return the first row or null */
export async function queryOne(sql, params) {
    const rows = await query(sql, params);
    return rows[0] ?? null;
}
/** Run an INSERT/UPDATE/DELETE and return affected row count */
export async function execute(sql, params) {
    const { rowCount } = await getPool().query(sql, params);
    return rowCount ?? 0;
}
//# sourceMappingURL=pool.js.map