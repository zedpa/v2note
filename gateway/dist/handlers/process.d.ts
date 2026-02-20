export interface ProcessPayload {
    text: string;
    audioUrl?: string;
    deviceId: string;
    recordId: string;
}
export interface ProcessResult {
    todos: string[];
    customer_requests: string[];
    setting_changes: string[];
    tags: string[];
}
/**
 * Process a single diary entry: run active skills to extract structured data.
 */
export declare function processEntry(payload: ProcessPayload): Promise<ProcessResult>;
