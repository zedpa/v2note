import { query, queryOne, execute } from "../pool.js";

export interface ChatMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant" | "context-summary";
  content: string;
  parts: any | null;
  compressed: boolean;
  /** 前端幂等键（localId），见 fix-cold-resume-silent-loss §6；旧数据为 null/undefined */
  client_id?: string | null;
  created_at: string;
}

/**
 * 写入一条聊天消息（用户/AI回复/压缩摘要）
 * 返回新消息的 id
 *
 * @param clientId 可选的前端幂等键（localId），见 fix-cold-resume-silent-loss §6
 */
export async function saveMessage(
  userId: string,
  role: string,
  content: string,
  parts?: any,
  clientId?: string | null,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO chat_message (user_id, role, content, parts, client_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, role, content, parts ? JSON.stringify(parts) : null, clientId ?? null],
  );
  return row!.id;
}

/**
 * 按 (user_id, client_id) 幂等查询：
 * 若前端用同一 localId 重试发送 chat.message，应返回首次持久化的消息，
 * 调用方可据此跳过重复 LLM 调用。
 *
 * 可选 role 参数允许只匹配特定角色（例如只查 user 消息）。
 */
export async function findByClientId(
  userId: string,
  clientId: string,
  role?: string,
): Promise<ChatMessage | null> {
  // A5 guard：空串/null/undefined 静默返回 null，避免 SQL WHERE client_id = '' 的巧合安全。
  if (!clientId || typeof clientId !== "string") return null;
  if (role) {
    return queryOne<ChatMessage>(
      `SELECT * FROM chat_message
       WHERE user_id = $1 AND client_id = $2 AND role = $3
       LIMIT 1`,
      [userId, clientId, role],
    );
  }
  return queryOne<ChatMessage>(
    `SELECT * FROM chat_message
     WHERE user_id = $1 AND client_id = $2
     LIMIT 1`,
    [userId, clientId],
  );
}

/**
 * 查找紧随某时间点之后的**最近一条** assistant 回复。
 *
 * 用于 chat.message 幂等配对（A3 修复）：
 * 原先实现用 getHistory(30) DESC 后 find(assistant && created_at > userMsg.created_at)
 * 会返回 **最新** assistant（即最后一轮对话的 AI 回复），而非紧跟该 user 消息的那条，
 * 造成跨话题回复污染。改为 SQL ASC LIMIT 1 精确拿"下一条"。
 *
 * regression: fix-cold-resume-silent-loss
 */
export async function findNextAssistantAfter(
  userId: string,
  afterCreatedAt: string | Date,
): Promise<ChatMessage | null> {
  return queryOne<ChatMessage>(
    `SELECT * FROM chat_message
     WHERE user_id = $1 AND role = 'assistant' AND created_at > $2
     ORDER BY created_at ASC LIMIT 1`,
    [userId, afterCreatedAt],
  );
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
