/**
 * 对话上下文压缩
 * spec: chat-persistence.md 场景 4.1-4.5
 */
import { chatCompletion } from "../ai/provider.js";
import { countUncompressed, getUncompressedMessages, saveMessage, markCompressed, getContextSummaries, } from "../db/repositories/chat-message.js";
const COMPRESS_THRESHOLD = 40;
const KEEP_RECENT = 20;
const MAX_SUMMARIES = 5;
/** 压缩 prompt：保留关键信息的指令 */
export const COMPRESS_PROMPT = `请将以下对话压缩为一段简洁的摘要，供后续对话参考。
必须保留：
- 用户表达的偏好和习惯
- 做出的决策和结论
- 提到的具体人名、项目名、数字
- 用户的情感状态变化
- 未完成的讨论或待跟进事项
可以省略：寒暄、重复内容、AI 的冗长解释`;
/** 判断是否需要触发压缩 */
export async function shouldCompress(userId) {
    const count = await countUncompressed(userId);
    return count > COMPRESS_THRESHOLD;
}
/**
 * 执行压缩：
 * 1. 取最早的 (N-20) 条未压缩消息
 * 2. AI 生成摘要
 * 3. 保存为 context-summary
 * 4. 标记源消息为 compressed
 * 5. 合并过多的 summary（>5 条时）
 */
export async function compressMessages(userId) {
    // 取所有未压缩消息（按时间正序，最早在前）
    // 用一个足够大的 limit 拿全部，getUncompressedMessages 返回倒序，需要 reverse
    const allUncompressed = await getUncompressedMessages(userId, 1000);
    const messages = allUncompressed.reverse(); // 时间正序
    if (messages.length <= COMPRESS_THRESHOLD)
        return;
    // 压缩最早的 N-20 条
    const toCompress = messages.slice(0, messages.length - KEEP_RECENT);
    if (toCompress.length === 0)
        return;
    // 构建对话文本
    const dialogText = toCompress
        .map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`)
        .join("\n\n");
    // 调用 AI 生成摘要（background tier = qwen3-max，关闭思考）
    const result = await chatCompletion([
        { role: "system", content: COMPRESS_PROMPT },
        { role: "user", content: dialogText },
    ], { tier: "background", temperature: 0.3 });
    const summary = result.content;
    if (!summary)
        return;
    // 保存 context-summary
    await saveMessage(userId, "context-summary", summary);
    // 标记源消息为已压缩
    await markCompressed(toCompress.map((m) => m.id));
    // 检查是否需要合并多条 summary
    const summaries = await getContextSummaries(userId);
    if (summaries.length > MAX_SUMMARIES) {
        await mergeSummaries(userId, summaries);
    }
    console.log(`[compression] Compressed ${toCompress.length} messages for user ${userId}, summary ${summary.length} chars`);
}
/** 合并多条 context-summary 为一条 */
async function mergeSummaries(userId, summaries) {
    const combined = summaries.map((s) => s.content).join("\n\n---\n\n");
    const mergeResult = await chatCompletion([
        {
            role: "system",
            content: "请将以下多段对话摘要合并为一段连贯的摘要。保留所有关键信息，去除重复内容。",
        },
        { role: "user", content: combined },
    ], { tier: "background", temperature: 0.3 });
    const merged = mergeResult.content;
    if (!merged)
        return;
    // 标记旧 summary 为 compressed，写入新合并的 summary
    await markCompressed(summaries.map((s) => s.id));
    await saveMessage(userId, "context-summary", merged);
    console.log(`[compression] Merged ${summaries.length} summaries into 1 (${merged.length} chars)`);
}
/**
 * 在 sendChatMessage 后异步调用，检查并执行压缩
 * 不阻塞当前请求
 */
export async function maybeCompress(userId) {
    try {
        if (await shouldCompress(userId)) {
            await compressMessages(userId);
        }
    }
    catch (err) {
        console.warn(`[compression] Failed for user ${userId}: ${err.message}`);
    }
}
//# sourceMappingURL=chat-compression.js.map