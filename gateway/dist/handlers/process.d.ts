import { type ActionExecResult } from "./voice-action.js";
export interface LocalConfigPayload {
    soul?: {
        content: string;
    };
    skills?: {
        configs: Array<{
            name: string;
            enabled: boolean;
            description?: string;
            type?: string;
            prompt?: string;
            builtin?: boolean;
        }>;
    };
    settings?: Record<string, unknown>;
    existingTags?: string[];
}
export type SourceContext = "todo" | "timeline" | "chat" | "review";
export interface ProcessPayload {
    text: string;
    audioUrl?: string;
    deviceId: string;
    userId?: string;
    recordId: string;
    notebook?: string;
    localConfig?: LocalConfigPayload;
    forceCommand?: boolean;
    sourceContext?: SourceContext;
}
export interface RelayExtract {
    text: string;
    source_person?: string;
    target_person?: string;
    context?: string;
    direction?: "outgoing" | "incoming";
}
export interface IntentSignal {
    type: "task" | "wish" | "goal" | "complaint" | "reflection";
    text: string;
    context?: string;
}
export interface ProcessResult {
    todos?: string[];
    intents?: IntentSignal[];
    pending_followups?: number;
    tags?: string[];
    relays?: RelayExtract[];
    summary?: string;
    error?: string;
    /** voice-action: 执行结果（指令型/混合型时存在） */
    action_results?: ActionExecResult[];
    /** voice-action: 意图类型 (record/action/mixed) */
    voice_intent_type?: "record" | "action" | "mixed";
    /** voice-action: 高风险操作等待用户确认的 ID */
    pending_confirm?: {
        confirm_id: string;
        summary: string;
    };
    /** Layer 1: 待办全能模式 — AI 提取的待办指令（前端 CommandSheet 用） */
    todo_commands?: TodoCommand[];
}
/** Layer 1 待办指令 */
export interface TodoCommand {
    action_type: "create" | "complete" | "modify" | "query";
    confidence: number;
    todo?: ExtractedTodo;
    target_hint?: string;
    target_id?: string;
    changes?: Partial<ExtractedTodo>;
    query_params?: {
        date?: string;
        goal_id?: string;
        status?: string;
    };
    /** query 结果：后端查询后填充 */
    query_result?: Array<{
        id: string;
        text: string;
        scheduled_start?: string;
        done: boolean;
        priority?: number;
    }>;
}
export interface ExtractedTodo {
    text: string;
    scheduled_start?: string;
    scheduled_end?: string;
    estimated_minutes?: number;
    priority?: number;
    person?: string;
    goal_hint?: string | null;
    reminder?: {
        enabled: boolean;
        before_minutes: number;
        types: ("notification" | "alarm" | "calendar")[];
    };
    recurrence?: {
        rule: string;
        end_date?: string | null;
    };
}
/**
 * Process a single diary entry: clean transcript text, save summary, trigger digest.
 *
 * 三层路由（v2）：
 * Layer 1: sourceContext="todo" → 待办全能模式（不存日记、不 Digest）
 * Layer 2: forceCommand=true → 全量 Agent 模式（不存日记、不 Digest）
 * Layer 3: 其余 → AI 分类 + 存日记 + 条件 Digest
 */
export declare function processEntry(payload: ProcessPayload): Promise<ProcessResult>;
