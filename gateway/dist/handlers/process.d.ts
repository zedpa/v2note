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
    recordId: string;
    localConfig?: LocalConfigPayload;
}
export interface RelayExtract {
    text: string;
    source_person?: string;
    target_person?: string;
    context?: string;
    direction?: "outgoing" | "incoming";
}
export interface ProcessResult {
    todos: string[];
    customer_requests: string[];
    setting_changes: string[];
    tags: string[];
    relays: RelayExtract[];
    summary?: string;
    error?: string;
}
/**
 * Process a single diary entry: run active skills to extract structured data.
 */
export declare function processEntry(payload: ProcessPayload): Promise<ProcessResult>;
