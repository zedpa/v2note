import pg from "pg";
export declare function getPool(): pg.Pool;
/** Run a query and return all rows typed as T */
export declare function query<T extends Record<string, any>>(sql: string, params?: any[]): Promise<T[]>;
/** Run a query and return the first row or null */
export declare function queryOne<T extends Record<string, any>>(sql: string, params?: any[]): Promise<T | null>;
/** Run an INSERT/UPDATE/DELETE and return affected row count */
export declare function execute(sql: string, params?: any[]): Promise<number>;
