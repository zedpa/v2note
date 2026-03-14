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
    todos: string[];
    intents: IntentSignal[];
    pending_followups: number;
    customer_requests: string[];
    setting_changes: string[];
    tags: string[];
    relays: RelayExtract[];
    summary?: string;
    error?: string;
}
/**
 * Process a single diary entry: hardcoded prompt + optional skills.
 */
export declare function processEntry(payload: ProcessPayload): Promise<ProcessResult>;
