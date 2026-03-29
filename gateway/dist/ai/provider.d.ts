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
/** Chunk type for deep thinking streams */
export interface DeepThinkChunk {
    type: "thinking" | "text";
    content: string;
}
/**
 * Streaming AI call with deep thinking (Qwen enable_thinking).
 *
 * Enables `enable_thinking: true` via providerOptions so the model
 * produces a reasoning chain before the final answer.
 *
 * Vercel AI SDK v6 exposes `reasoning` on the stream result when the
 * provider returns `reasoning_content` chunks. We yield those as
 * `{ type: "thinking" }` and normal text as `{ type: "text" }`.
 *
 * If the SDK version does not surface reasoning separately, all
 * content is yielded as "text" — callers can show a generic
 * "深度思考中..." indicator based on elapsed time.
 */
export declare function chatCompletionStreamDeepThink(messages: ChatMessage[], opts?: {
    temperature?: number;
    thinkingBudget?: number;
}): AsyncGenerator<DeepThinkChunk, void, undefined>;
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
/**
 * AI call with native function calling (tool use).
 *
 * Uses Vercel AI SDK's generateText with tools + maxSteps.
 * Replaces the old manual JSON extraction + 3-round loop.
 */
export declare function generateWithTools(messages: ChatMessage[], tools: Record<string, any>, opts?: {
    temperature?: number;
    timeout?: number;
    maxSteps?: number;
}): Promise<{
    text: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}>;
/**
 * 手动 tool call 循环（绕过 AI SDK maxSteps 的 DashScope 兼容性 bug）
 *
 * 已知问题：@ai-sdk/openai v3 + DashScope 的 tool calling 有两个 bug：
 * 1. tool call args 始终被解析为空对象 {}（参数丢失）
 * 2. tool result 后不发起第二轮请求（maxSteps 无效）
 *
 * 本实现：手动从 fullStream 收集 tool_calls → 手动解析参数 → 手动执行 →
 *         构造带 tool result 的消息 → 发起新一轮 streamText。
 */
export declare function streamWithTools(messages: ChatMessage[], tools: Record<string, any>, opts?: {
    temperature?: number;
    maxSteps?: number;
    deepThink?: boolean;
    thinkingBudget?: number;
}): AsyncGenerator<string, void, undefined>;
/**
 * Streaming AI call with tools + deep thinking, yielding typed chunks.
 *
 * Same as streamWithTools but returns DeepThinkChunk with thinking/text distinction.
 */
export declare function streamWithToolsDeepThink(messages: ChatMessage[], tools: Record<string, any>, opts?: {
    temperature?: number;
    maxSteps?: number;
    thinkingBudget?: number;
}): AsyncGenerator<DeepThinkChunk, void, undefined>;
export { getProvider };
