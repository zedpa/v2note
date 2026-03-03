export interface ChatStartPayload {
    deviceId: string;
    mode: "review" | "command";
    dateRange: {
        start: string;
        end: string;
    };
    initialMessage?: string;
    localConfig?: {
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
            selectedReviewSkill?: string;
        };
    };
}
/**
 * Start a review chat session.
 * Loads memory, soul, and skills into the session context.
 * Returns the initial AI greeting.
 */
export declare function startChat(payload: ChatStartPayload): Promise<AsyncGenerator<string, void, undefined>>;
/**
 * Send a message in an ongoing chat session.
 * Supports built-in tool calls: if AI responds with tool_calls JSON,
 * execute them and re-call AI for the final streaming response.
 */
export declare function sendChatMessage(deviceId: string, text: string): Promise<AsyncGenerator<string, void, undefined>>;
/**
 * End a chat session. Summarize the conversation and update memory/soul.
 */
export declare function endChat(deviceId: string): Promise<void>;
