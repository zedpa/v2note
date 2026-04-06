/**
 * 每日对话日记：daily-loop 中调用，生成当天 chat 总结写入 ai_diary
 * spec: chat-persistence.md 场景 6.1-6.3
 */
import { chatCompletion } from "../ai/provider.js";
import { getMessagesByDate } from "../db/repositories/chat-message.js";
import { upsertEntry } from "../db/repositories/ai-diary.js";
const DIARY_PROMPT = `请将以下用户与AI的对话总结为一段简洁的日记段落。
要求：
- 以第三人称叙述（"用户"）
- 保留关键话题、决策、情感变化
- 不含 system prompt 内容
- 100-300字`;
/**
 * 查询当天所有 chat 消息，生成日记段落写入 ai_diary。
 * 无消息时静默跳过。
 */
export async function generateChatDiary(deviceId, userId, date) {
    const messages = await getMessagesByDate(userId, date);
    if (messages.length === 0)
        return;
    // 构建对话文本
    const dialogText = messages
        .map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`)
        .join("\n\n");
    const result = await chatCompletion([
        { role: "system", content: DIARY_PROMPT },
        { role: "user", content: dialogText },
    ], { tier: "background", temperature: 0.5 });
    const diary = result.content;
    if (!diary)
        return;
    // 写入 ai_diary（notebook = "chat-daily"）
    await upsertEntry(deviceId, "chat-daily", date, diary, userId);
    console.log(`[chat-diary] Generated diary for ${userId} on ${date} (${diary.length} chars, from ${messages.length} messages)`);
}
//# sourceMappingURL=chat-daily-diary.js.map