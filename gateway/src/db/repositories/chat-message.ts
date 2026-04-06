import { query, queryOne, execute } from "../pool.js";

export interface ChatMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant" | "context-summary";
  content: string;
  parts: any | null;
  compressed: boolean;
  created_at: string;
}

/**
 * 写入一条聊天消息（用户/AI回复/压缩摘要）
 * 返回新消息的 id
 */
export async function saveMessage(
  userId: string,
  role: string,
  content: string,
  parts?: any,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO chat_message (user_id, role, content, parts)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, role, content, parts ? JSON.stringify(parts) : null],
  );
  return row!.id;
}

/**
 * 分页读取历史消息（用户视角，不含 context-summary）
 * 按时间倒序返回，前端需 reverse 后展示
 */
export async function getHistory(
  userId: string,
  limit: number,
  before?: string,
): Promise<ChatMessage[]> {
  if (before) {
    return query<ChatMessage>(
      `SELECT * FROM chat_message
       WHERE user_id = $1
         AND role != 'context-summary'
         AND created_at < (SELECT created_at FROM chat_message WHERE id = $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, before, limit],
    );
  }
  return query<ChatMessage>(
    `SELECT * FROM chat_message
     WHERE user_id = $1
       AND role != 'context-summary'
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
}

/**
 * 获取所有 context-summary 消息（按时间正序，用于 AI 上下文组装）
 */
export async function getContextSummaries(
  userId: string,
): Promise<ChatMessage[]> {
  return query<ChatMessage>(
    `SELECT * FROM chat_message
     WHERE user_id = $1 AND role = 'context-summary'
     ORDER BY created_at ASC`,
    [userId],
  );
}

/**
 * 获取最近 N 条未压缩的 user/assistant 消息（用于 AI 上下文组装）
 */
export async function getUncompressedMessages(
  userId: string,
  limit: number,
): Promise<ChatMessage[]> {
  return query<ChatMessage>(
    `SELECT * FROM chat_message
     WHERE user_id = $1
       AND compressed = false
       AND role != 'context-summary'
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
}

/**
 * 将指定消息标记为已压缩
 */
export async function markCompressed(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  await execute(
    `UPDATE chat_message SET compressed = true WHERE id = ANY($1)`,
    [messageIds],
  );
}

/**
 * 获取指定日期的 user/assistant 消息（用于每日日记总结）
 */
export async function getMessagesByDate(
  userId: string,
  date: string,
): Promise<ChatMessage[]> {
  return query<ChatMessage>(
    `SELECT * FROM chat_message
     WHERE user_id = $1
       AND created_at::date = $2
       AND role IN ('user', 'assistant')
     ORDER BY created_at ASC`,
    [userId, date],
  );
}

/**
 * 删除用户的所有聊天消息（含 context-summary）
 */
export async function deleteAllByUser(userId: string): Promise<void> {
  await execute(
    `DELETE FROM chat_message WHERE user_id = $1`,
    [userId],
  );
}

/**
 * 统计未压缩消息数量（用于判断是否触发压缩）
 */
export async function countUncompressed(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM chat_message
     WHERE user_id = $1
       AND compressed = false
       AND role != 'context-summary'`,
    [userId],
  );
  return parseInt(row?.count ?? "0", 10);
}
