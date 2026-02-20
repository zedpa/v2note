import type { ChatMessage } from "../ai/provider.js";
/**
 * Manages the context window for a conversation session.
 * Keeps messages trimmed to stay within limits.
 */
export declare class SessionContext {
    private messages;
    private systemPrompt;
    setSystemPrompt(prompt: string): void;
    addMessage(msg: ChatMessage): void;
    getMessages(): ChatMessage[];
    clear(): void;
    getHistory(): ChatMessage[];
}
