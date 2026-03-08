/**
 * AI provider — uses Vercel AI SDK v6 with DashScope OpenAI-compatible API.
 *
 * Vercel AI SDK provides:
 * - Type-safe structured output via generateObject() + Zod schemas
 * - Unified streaming via streamText()
 * - Automatic retries and error handling
 * - Provider-agnostic interface (swap models easily)
 *
 * Environment variables are read lazily (on first call) because
 * dotenv.config() in index.ts runs AFTER ESM imports are resolved.
 */
import type { z } from "zod";
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
declare function getProvider(): {
    provider: import("@ai-sdk/openai").OpenAIProvider;
    model: string;
    timeout: number;
};
/**
 * Non-streaming AI call. Returns the full response.
 * Backward-compatible with the old raw-fetch interface.
 */
export declare function chatCompletion(messages: ChatMessage[], opts?: {
    json?: boolean;
    temperature?: number;
    timeout?: number;
}): Promise<AIResponse>;
/**
 * Streaming AI call. Yields text chunks.
 * Backward-compatible async generator interface.
 */
export declare function chatCompletionStream(messages: ChatMessage[], opts?: {
    temperature?: number;
}): AsyncGenerator<string, void, undefined>;
/**
 * Structured output via Zod schema — type-safe JSON extraction.
 * Uses AI SDK's generateObject() for guaranteed schema conformance.
 *
 * Usage:
 *   const result = await generateStructured(messages, todoSchema, { temperature: 0.3 });
 *   // result.object is fully typed according to the Zod schema
 */
export declare function generateStructured<T>(messages: ChatMessage[], schema: z.ZodType<T>, opts?: {
    temperature?: number;
    timeout?: number;
    schemaName?: string;
    schemaDescription?: string;
}): Promise<{
    object: T;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}>;
export { getProvider };
