/** 全局工具注册表——启动时初始化一次 */
declare const toolRegistry: import("../tools/registry.js").ToolRegistry;
export interface ChatStartPayload {
    deviceId: string;
    userId?: string;
    mode: "review" | "command" | "insight" | "decision";
    dateRange: {
        start: string;
        end: string;
    };
    initialMessage?: string;
    assistantPreamble?: string;
    /** 前端显式指定的 skill（从技能面板或 "/skill" 触发） */
    skill?: string;
    localConfig?: {
        soul?: {
            content: string;
        };
        skills?: {
            configs: Array<{
                name: string;
                enabled: boolean;
                description?: string;
                prompt?: string;
                builtin?: boolean;
            }>;
            selectedInsightSkill?: string;
            /** @deprecated Use selectedInsightSkill */
            selectedReviewSkill?: string;
        };
    };
}
/**
 * Initialize a chat session: load context, build system prompt, restore history.
 * Does NOT generate any AI response — all messages go through handleChatMessage.
 */
export declare function initChat(payload: ChatStartPayload): Promise<void>;
export declare function sendChatMessage(deviceId: string, text: string): Promise<AsyncGenerator<string, void, undefined>>;
/**
 * End a chat session.
 * Soul/Profile/UserAgent 的更新主要由 AI 在对话中通过工具自主完成。
 * AI 日记由 daily-loop 的 generateChatDiary 批量生成。
 * endChat 做轻量 fallback 检测 + 清理 session。
 */
export declare function endChat(deviceId: string): Promise<void>;
/** 导出 toolRegistry 供 MCP server 等外部模块使用 */
export { toolRegistry };
