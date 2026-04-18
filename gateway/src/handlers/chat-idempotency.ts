/**
 * chat.message WS 幂等辅助
 *
 * Spec: fix-cold-resume-silent-loss §6 Gateway 契约
 *
 * 目的：前端断网重连后可能用同一 client_id 重发 user 消息。
 * 我们必须：
 *   1. 不重新调用 LLM（当 assistant 已存在时）
 *   2. 不重复持久化 user 消息（即使 assistant 还没配对）
 *   3. 回放首次的 assistant 回复（若已有）
 *
 * A3 修复（fix-cold-resume-silent-loss Phase 3 对抗性审查）：
 *   原实现用 getHistory(30) DESC 后取第一条 created_at > userMsg.created_at 的 assistant，
 *   会命中"最新 assistant"而非"紧随 user 的那条 assistant"，造成跨话题污染。
 *   改为 chatMessageRepo.findNextAssistantAfter(userId, userMsg.created_at) 精确配对。
 *
 * A4 契约（fix-cold-resume-silent-loss Phase 3 对抗性审查）：
 *   返回值明确区分三种状态：
 *     - null                              → user 消息不存在（正常走主路径）
 *     - hasAssistantReply: true           → 配对成功，WS 层短路 chat.done
 *     - hasAssistantReply: false          → user 存在但无 assistant（上次 LLM 崩了）
 *                                           WS 层应**跳过 user 持久化**但**继续生成 assistant**
 */
import { chatMessageRepo } from "../db/repositories/index.js";

export interface CachedChatReply {
  /** 首次持久化的 user 消息 ID */
  userMessageId: string;
  /** 首次持久化 user 消息的 created_at（ISO 字符串），供调用方复用 */
  userCreatedAt: string;
  /** 对应的 assistant 回复文本（无回复时为空字符串） */
  text: string;
  /** 是否找到了配对的 assistant 回复 */
  hasAssistantReply: boolean;
}

/**
 * 查询给定 (userId, clientId) 是否已有 user 消息，
 * 若有则返回其之后**紧邻的一条** assistant 回复（ASC LIMIT 1）。
 *
 * @returns 命中时返回缓存内容；未命中（或 clientId 缺失）返回 null
 */
export async function findCachedChatReply(
  userId: string,
  clientId: string | null | undefined,
): Promise<CachedChatReply | null> {
  if (!clientId) return null;

  const userMsg = await chatMessageRepo.findByClientId(userId, clientId, "user");
  if (!userMsg) return null;

  // A3: 用 SQL 精确取"下一条 assistant"，避免 DESC 历史的最新污染
  const assistantReply = await chatMessageRepo.findNextAssistantAfter(
    userId,
    userMsg.created_at,
  );

  if (assistantReply) {
    return {
      userMessageId: userMsg.id,
      userCreatedAt: userMsg.created_at,
      text: assistantReply.content,
      hasAssistantReply: true,
    };
  }

  // 有 user 消息但还没来得及生成 assistant 回复（少见：首次请求中途崩）
  return {
    userMessageId: userMsg.id,
    userCreatedAt: userMsg.created_at,
    text: "",
    hasAssistantReply: false,
  };
}
