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
 * Start a review/insight chat session.
 * Loads memory, soul, and skills into the session context.
 * Returns the initial AI greeting.
 */
export declare function startChat(payload: ChatStartPayload): Promise<AsyncGenerator<string, void, undefined>>;
/**
 * Send a message in an ongoing chat session.
 */
export declare function sendChatMessage(deviceId: string, text: string): Promise<AsyncGenerator<string, void, undefined>>;
/**
 * End a chat session. Summarize the conversation and update memory/soul.
 */
export declare function endChat(deviceId: string): Promise<void>;
/** 导出 toolRegistry 供 MCP server 等外部模块使用 */
export { toolRegistry };
