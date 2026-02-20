/**
 * AI provider — calls qwen-plus via OpenAI-compatible API.
 */
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface AIResponse {
    content: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}
/**
 * Non-streaming AI call. Returns the full response.
 */
export declare function chatCompletion(messages: ChatMessage[], opts?: {
    json?: boolean;
    temperature?: number;
}): Promise<AIResponse>;
/**
 * Streaming AI call. Yields text chunks.
 */
export declare function chatCompletionStream(messages: ChatMessage[], opts?: {
    temperature?: number;
}): AsyncGenerator<string, void, undefined>;
