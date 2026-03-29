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
export interface ProcessPayload {
    text: string;
    audioUrl?: string;
    deviceId: string;
    userId?: string;
    recordId: string;
    notebook?: string;
    localConfig?: LocalConfigPayload;
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
    customer_requests?: string[];
    setting_changes?: string[];
    tags?: string[];
    relays?: RelayExtract[];
    summary?: string;
    error?: string;
    /** voice-action: 执行结果（指令型/混合型时存在） */
    action_results?: ActionExecResult[];
    /** voice-action: 意图类型 (record/action/mixed) */
    voice_intent_type?: "record" | "action" | "mixed";
}
/**
 * Process a single diary entry: clean transcript text, save summary, trigger digest.
 */
export declare function processEntry(payload: ProcessPayload): Promise<ProcessResult>;
