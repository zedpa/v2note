export interface ChatStartPayload {
    deviceId: string;
    mode: "review";
    dateRange: {
        start: string;
        end: string;
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
 */
export declare function sendChatMessage(deviceId: string, text: string): Promise<AsyncGenerator<string, void, undefined>>;
/**
 * End a chat session. Summarize the conversation and update memory/soul.
 */
export declare function endChat(deviceId: string): Promise<void>;
