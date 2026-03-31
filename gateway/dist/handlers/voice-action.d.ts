/**
 * Voice Action — 语音指令自动识别与执行
 *
 * 统一入口：用户说话后 AI 判断是"记录"还是"指令"还是"混合"，
 * 指令型直接走 Agent 工具链执行，无需用户手动切换模式。
 */
export type ActionIntent = "modify_todo" | "complete_todo" | "query_todo" | "delete_todo" | "create_todo" | "modify_goal" | "query_record" | "query_goal" | "general_command";
export interface VoiceAction {
    type: ActionIntent;
    confidence: number;
    target_hint: string;
    changes?: Record<string, any>;
    query_params?: Record<string, any>;
    risk_level: "low" | "high";
    original_text: string;
}
export interface VoiceIntentResult {
    type: "record" | "action" | "mixed";
    record_text?: string;
    actions: VoiceAction[];
}
export interface ActionExecResult {
    action: ActionIntent;
    success: boolean;
    summary: string;
    todo_id?: string;
    goal_id?: string;
    items?: any[];
    changes?: Record<string, any>;
    needs_confirm?: boolean;
    confirm_summary?: string;
    skipped?: boolean;
}
interface ActionContext {
    userId?: string;
    deviceId: string;
    recordId?: string;
}
export declare function classifyVoiceIntent(text: string, forceAction?: boolean): Promise<VoiceIntentResult>;
export declare function matchTodoByHint(hint: string, ctx: ActionContext): Promise<{
    id: string;
    text: string;
} | null>;
export declare function executeVoiceAction(action: VoiceAction, ctx: ActionContext): Promise<ActionExecResult>;
export {};
