/**
 * Embedding 持久化写入模块
 *
 * 为 todo / goal 创建后异步写入 embedding 向量到数据库。
 * 采用"火后不管"模式：不阻塞主链路，失败静默记录日志。
 */

import { getEmbedding } from "../memory/embeddings.js";
import { execute } from "../db/pool.js";

/**
 * 为 todo 异步写入 embedding。
 * level >= 1 同时写入 goal_embedding，level = 0 写入 todo_embedding。
 */
export async function writeTodoEmbedding(
  todoId: string,
  text: string,
  level: number = 0,
): Promise<void> {
  try {
    const embedding = await getEmbedding(text);
    const pgVector = `[${embedding.join(",")}]`;

    if (level >= 1) {
      // 目标/项目 → goal_embedding
      await execute(
        `INSERT INTO goal_embedding(goal_id, embedding)
         VALUES($1, $2::vector)
         ON CONFLICT(goal_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
        [todoId, pgVector],
      );
    } else {
      // 原子待办 → todo_embedding
      await execute(
        `INSERT INTO todo_embedding(todo_id, embedding)
         VALUES($1, $2::vector)
         ON CONFLICT(todo_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
        [todoId, pgVector],
      );
    }
  } catch (err: any) {
    console.warn(`[embed-writer] todo ${todoId} embedding 写入失败: ${err.message}`);
  }
}

/**
 * 为 record 异步写入 embedding（整条文本向量化）。
 * 调用方应 void 调用（不 await），不阻塞主流程。
 */
export async function writeRecordEmbedding(recordId: string, text: string): Promise<void> {
  try {
    const embedding = await getEmbedding(text);
    const pgVector = `[${embedding.join(",")}]`;
    await execute(
      `UPDATE record SET embedding = $1::vector WHERE id = $2`,
      [pgVector, recordId],
    );
  } catch (err: any) {
    console.warn(`[embed-writer] record ${recordId} embedding 写入失败: ${err.message}`);
  }
}
