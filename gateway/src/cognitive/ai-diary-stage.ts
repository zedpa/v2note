/**
 * AI 交互素材分发 — Phase 14.10
 *
 * 阶段 3 的独立模块：将用户与 AI 的有价值对话摘要，
 * 作为 source_type='ai_diary' 的 record 挂载到对应 page 下。
 *
 * 数据来源：
 * 1. 当日 chat 消息中的 Q&A（有认知价值的对话）
 * 2. 编译变更摘要（可选，由调用方传入）
 */

import { getMessagesByDate } from "../db/repositories/chat-message.js";
import * as recordRepo from "../db/repositories/record.js";
import { query } from "../db/pool.js";
import { today as tzToday } from "../lib/tz.js";

/** 最短有价值对话长度（字符数），低于此阈值视为闲聊 */
const MIN_VALUABLE_CONTENT_LENGTH = 100;

export interface AiDiaryResult {
  chatRecordsCreated: number;
  summaryRecordCreated: boolean;
}

/**
 * 生成 AI 交互素材 record
 *
 * @param userId - 用户 ID
 * @param options - 可选参数
 * @param options.compileSummary - 编译变更摘要文本（如"今日编译：新建 2 个 page"）
 */
export async function generateAiDiaryRecords(
  userId: string,
  options?: { compileSummary?: string },
): Promise<AiDiaryResult> {
  const result: AiDiaryResult = {
    chatRecordsCreated: 0,
    summaryRecordCreated: false,
  };

  // 获取用户的 device_id（回退到 userId）
  const deviceId = await getDeviceId(userId);
  const todayStr = tzToday();

  // ── 1. 查找当日 chat 消息，提取有认知价值的对话 ──
  try {
    const messages = await getMessagesByDate(userId, todayStr);

    if (messages.length > 0) {
      // 拼接所有消息内容，判断是否有实质认知价值
      const fullContent = messages
        .map(m => `[${m.role}] ${m.content}`)
        .join("\n");

      if (fullContent.length >= MIN_VALUABLE_CONTENT_LENGTH) {
        // 构建摘要文本
        const summaryText = buildChatSummary(messages);

        // 创建 ai_diary record
        const rec = await recordRepo.create({
          device_id: deviceId,
          user_id: userId,
          status: "completed",
          source: "chat_digest",
          source_type: "ai_diary",
        });

        // 直接更新 record 的 compile_status 为 pending，使其参与编译
        await query(
          `UPDATE record SET compile_status = 'pending' WHERE id = $1`,
          [rec.id],
        );

        // 写入 transcript
        await query(
          `INSERT INTO transcript (record_id, text) VALUES ($1, $2) ON CONFLICT (record_id) DO UPDATE SET text = $2`,
          [rec.id, summaryText],
        );

        result.chatRecordsCreated = 1;
      }
    }
  } catch (err: any) {
    console.error(`[ai-diary-stage] chat 消息处理失败: ${err.message}`);
  }

  // ── 2. 编译变更摘要（可选）──
  if (options?.compileSummary) {
    try {
      const rec = await recordRepo.create({
        device_id: deviceId,
        user_id: userId,
        status: "completed",
        source: "system_compile",
        source_type: "ai_diary",
      });

      await query(
        `UPDATE record SET compile_status = 'pending' WHERE id = $1`,
        [rec.id],
      );

      await query(
        `INSERT INTO transcript (record_id, text) VALUES ($1, $2) ON CONFLICT (record_id) DO UPDATE SET text = $2`,
        [rec.id, options.compileSummary],
      );

      result.summaryRecordCreated = true;
    } catch (err: any) {
      console.error(`[ai-diary-stage] 编译摘要 record 创建失败: ${err.message}`);
    }
  }

  return result;
}

/** 从 chat 消息构建摘要文本 */
function buildChatSummary(
  messages: Array<{ role: string; content: string; created_at: string }>,
): string {
  const parts: string[] = ["## AI 参谋对话摘要\n"];

  // 按对话对（user→assistant）组织
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user") {
      parts.push(`**问**: ${msg.content.slice(0, 200)}`);
    } else if (msg.role === "assistant") {
      parts.push(`**答**: ${msg.content.slice(0, 500)}`);
      parts.push("");
    }
  }

  return parts.join("\n");
}

/** 获取用户的 device_id，找不到时回退到 userId */
async function getDeviceId(userId: string): Promise<string> {
  try {
    const rows = await query<{ device_id: string }>(
      `SELECT device_id FROM record WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    return rows[0]?.device_id ?? userId;
  } catch {
    return userId;
  }
}
