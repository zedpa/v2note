/**
 * 主动闲聊内容生成
 * ai-companion-window spec 场景 5.1-5.2
 *
 * 频率硬限制（"AI 沉默为主"原则）：
 * - 两条主动消息间隔 ≥ 2 小时
 * - 每日主动闲聊总数 ≤ 3 条
 */
import { chatCompletion } from "../ai/provider.js";
/** 待办完成时的奖励词库（不需要 AI 调用） */
const REWARD_PHRASES = [
    "又搞定一个 ✓",
    "漂亮",
    "效率不错",
    "一步一步来",
    "稳扎稳打",
    "做得好",
    "又少了一件事",
    "继续保持",
];
/** 获取随机奖励语（不消耗 AI 调用量） */
export function getRewardPhrase() {
    return REWARD_PHRASES[Math.floor(Math.random() * REWARD_PHRASES.length)];
}
/** AI 生成主动闲聊（一句话，≤30字） */
export async function generateCompanionChat(trigger, context) {
    if (trigger === "todo_complete") {
        return getRewardPhrase();
    }
    const strikeSummary = context.recentStrikes
        .slice(0, 3)
        .map((s) => s.nucleus)
        .join("；");
    const timeLabel = {
        morning: "早上",
        afternoon: "下午",
        evening: "晚上",
        night: "深夜",
    }[context.timeOfDay];
    const prompt = `你是路路，一只温暖的AI小鹿伙伴。
当前心情: ${context.mood}
时段: ${timeLabel}
用户最近说的: ${strikeSummary || "暂无"}
${context.userProfile?.occupation ? `用户职业: ${context.userProfile.occupation}` : ""}

请生成一句主动闲聊（≤30字），口语化，像朋友随口说的。
类型可以是: 疑问/赞同/认可/表扬/好奇/关心（不能是指令/建议）。
必须关联用户真实内容（不能泛泛而谈）。
如果没有用户内容，用简单的问候。
只输出这一句话，不要其他内容。`;
    try {
        const result = await chatCompletion([{ role: "user", content: prompt }]);
        const text = result.content;
        return text.trim().slice(0, 50); // 安全截断
    }
    catch {
        // AI 调用失败，返回默认问候
        const defaults = {
            daily_open: "新的一天，加油",
            todo_complete: getRewardPhrase(),
            digest_insight: "有些想法在冒泡",
            idle_prompt: "在想什么呢？",
        };
        return defaults[trigger];
    }
}
/**
 * 频率限制器
 * 在 ProactiveEngine 中使用，控制闲聊频率
 */
export class ChatRateLimiter {
    lastChatTime = 0;
    dailyCounts = new Map(); // date → count
    /** 检查是否可以发送闲聊 */
    canSend() {
        const now = Date.now();
        const today = new Date().toISOString().split("T")[0];
        // 两条间隔 ≥ 2 小时
        if (now - this.lastChatTime < 2 * 60 * 60 * 1000)
            return false;
        // 每日 ≤ 3 条
        const todayCount = this.dailyCounts.get(today) || 0;
        if (todayCount >= 3)
            return false;
        return true;
    }
    /** 记录一次发送 */
    record() {
        this.lastChatTime = Date.now();
        const today = new Date().toISOString().split("T")[0];
        this.dailyCounts.set(today, (this.dailyCounts.get(today) || 0) + 1);
        // 清理旧日期
        for (const [date] of this.dailyCounts) {
            if (date < today)
                this.dailyCounts.delete(date);
        }
    }
}
//# sourceMappingURL=chat-generator.js.map