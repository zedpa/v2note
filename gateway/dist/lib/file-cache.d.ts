/**
 * 通用文件缓存（Soul/Profile 等高频读低频写数据）
 *
 * 两级缓存：内存 LRU(5min) → 磁盘文件(1h) → 数据源
 * 写入时 write-through 两层
 */
export interface FileCache<T> {
    get(key: string): T | null;
    set(key: string, value: T): void;
    invalidate(key: string): void;
}
/**
 * 创建一个带磁盘持久层的缓存
 * @param namespace 缓存命名空间（如 'soul', 'profile'）
 * @param memTtlMs 内存层 TTL（默认 5 分钟）
 * @param diskTtlMs 磁盘层 TTL（默认 1 小时）
 */
export declare function createFileCache<T>(namespace: string, memTtlMs?: number, diskTtlMs?: number): FileCache<T>;
