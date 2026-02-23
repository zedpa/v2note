export interface LocalConfigPayload {
    soul?: {
        content: string;
    };
    skills?: {
        configs: Array<{
            name: string;
            enabled: boolean;
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
export interface ProcessResult {
    todos: string[];
    customer_requests: string[];
    setting_changes: string[];
    tags: string[];
    summary?: string;
    error?: string;
}
/**
 * Process a single diary entry: run active skills to extract structured data.
 */
export declare function processEntry(payload: ProcessPayload): Promise<ProcessResult>;
