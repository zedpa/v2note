export interface ChatStartPayload {
    deviceId: string;
    userId?: string;
    mode: "review" | "command" | "insight";
    dateRange: {
        start: string;
        end: string;
    };
    initialMessage?: string;
    assistantPreamble?: string;
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
