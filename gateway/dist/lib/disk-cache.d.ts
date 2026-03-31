/**
 * Embedding 磁盘持久缓存
 *
 * 用文件系统存储 embedding 向量，避免进程重启后重新调用 DashScope。
 * 每个 embedding 存为一个 .bin 文件（Float32Array 原始字节），按 key 哈希分桶。
 * 零外部依赖，纯 Node.js fs。
 */
/**
 * 从磁盘读取 embedding 向量
 */
export declare function getDiskEmbedding(key: string): number[] | null;
/**
 * 将 embedding 向量写入磁盘
 */
export declare function setDiskEmbedding(key: string, vector: number[]): void;
/**
 * 清理旧缓存文件（按修改时间淘汰），启动时调用
 */
export declare function cleanupDiskCache(maxEntries?: number): number;
