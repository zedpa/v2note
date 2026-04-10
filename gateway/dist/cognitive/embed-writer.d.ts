/**
 * Embedding 持久化写入模块
 *
 * 为 strike / todo / goal 创建后异步写入 embedding 向量到数据库。
 * 采用"火后不管"模式：不阻塞主链路，失败静默记录日志。
 */
/**
 * 为 strike 异步写入 embedding。
 * 调用方应 void 调用（不 await），不阻塞主流程。
 */
export declare function writeStrikeEmbedding(strikeId: string, nucleus: string): Promise<void>;
/**
 * 为 todo 异步写入 embedding。
 * level >= 1 同时写入 goal_embedding，level = 0 写入 todo_embedding。
 */
export declare function writeTodoEmbedding(todoId: string, text: string, level?: number): Promise<void>;
/**
 * 为 record 异步写入 embedding（整条文本向量化，替代逐 strike 向量化）。
 * 调用方应 void 调用（不 await），不阻塞主流程。
 */
export declare function writeRecordEmbedding(recordId: string, text: string): Promise<void>;
/**
 * 批量为已有 strike 补写 embedding（用于迁移/修复）。
 * 返回成功写入数量。
 */
export declare function backfillStrikeEmbeddings(userId: string, batchSize?: number): Promise<number>;
