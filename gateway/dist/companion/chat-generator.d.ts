/**
 * 主动闲聊内容生成
 * ai-companion-window spec 场景 5.1-5.2
 *
 * 频率硬限制（"AI 沉默为主"原则）：
 * - 两条主动消息间隔 ≥ 2 小时
 * - 每日主动闲聊总数 ≤ 3 条
 */
export type ChatTrigger = "daily_open" | "todo_complete" | "digest_insight" | "idle_prompt";
interface ChatContext {
    mood: string;
    recentStrikes: Array<{
        nucleus: string;
        polarity: string;
    }>;
    timeOfDay: "morning" | "afternoon" | "evening" | "night";
    userProfile?: {
        occupation?: string;
        interests?: string[];
    };
}
/** 获取随机奖励语（不消耗 AI 调用量） */
export declare function getRewardPhrase(): string;
/** AI 生成主动闲聊（一句话，≤30字） */
export declare function generateCompanionChat(trigger: ChatTrigger, context: ChatContext): Promise<string>;
/**
 * 频率限制器
 * 在 ProactiveEngine 中使用，控制闲聊频率
 */
export declare class ChatRateLimiter {
    private lastChatTime;
    private dailyCounts;
    /** 检查是否可以发送闲聊 */
    canSend(): boolean;
    /** 记录一次发送 */
    record(): void;
}
export {};
