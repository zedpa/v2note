/**
 * AI provider — 多模型分层架构
 *
 * 5 种模型层级（ModelTier），按用途分配不同模型：
 *   fast       — 管道提取（文本清理/分类/Strike/Todo），要求低延迟
 *   agent      — 聊天工具调用 + 简单对话，低延迟，无推理
 *   chat       — 复杂对话 + 深度分析，需要推理能力
 *   report     — 简报/复盘/批量分析，后台生成，需要质量
 *   background — 记忆/人格/画像更新，低优先级
 *   vision     — 图片理解
 *
 * 环境变量配置（.env）：
 *   AI_MODEL_FAST=qwen-plus
 *   AI_MODEL_AGENT=MiniMax/MiniMax-M2.5
 *   AI_MODEL_CHAT=qwen3.5-plus
 *   AI_MODEL_REPORT=qwen3.5-plus
 *   AI_MODEL_BACKGROUND=qwen3-max
 *   AI_MODEL_VISION=qwen-vl-max
 *   AI_MODEL=qwen-plus              # 兜底默认模型
 *   AI_TIMEOUT=60000
 */
import { createOpenAI } from "@ai-sdk/openai";
import type { z } from "zod";
import { Priority } from "../lib/semaphore.js";
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
/** Chunk type for deep thinking streams */
export interface DeepThinkChunk {
    type: "thinking" | "text";
    content: string;
}
/**
 * 模型层级：
 * - fast: 管道提取，低延迟，无推理
 * - agent: 聊天工具调用 + 简单对话，低延迟，无推理（MiniMax）
 * - chat: 复杂对话 + 深度分析，推理模型
 * - report: 简报/复盘/批量，后台，推理
 * - background: 记忆/画像更新，低优先级，无推理
 * - vision: 图片理解
 */
export type ModelTier = "fast" | "agent" | "chat" | "report" | "background" | "vision";
interface TierConfig {
    model: string;
    reasoning: boolean;
    timeout: number;
}
declare function isReasoningModel(model: string): boolean;
/** 获取指定层级的配置 */
declare function getTier(tier: ModelTier): {
    provider: ReturnType<typeof createOpenAI>;
    config: TierConfig;
};
/** 兼容旧接口：无 tier 时使用 fast */
declare function getProvider(): {
    provider: import("@ai-sdk/openai").OpenAIProvider;
    model: string;
    timeout: number;
};
/**
 * Non-streaming AI call.
 * @param tier - 模型层级（默认 "fast"）
 */
export declare function chatCompletion(messages: ChatMessage[], opts?: {
    json?: boolean;
    temperature?: number;
    timeout?: number;
    tier?: ModelTier;
}): Promise<AIResponse>;
/**
 * Streaming AI call. Yields text chunks.
 * @param tier - 模型层级（默认 "chat"）
 */
export declare function chatCompletionStream(messages: ChatMessage[], opts?: {
    temperature?: number;
    tier?: ModelTier;
}): AsyncGenerator<string, void, undefined>;
/**
 * Streaming AI call with deep thinking (Qwen enable_thinking).
 * 始终启用推理，使用 chat 层级模型。
 */
export declare function chatCompletionStreamDeepThink(messages: ChatMessage[], opts?: {
    temperature?: number;
    thinkingBudget?: number;
}): AsyncGenerator<DeepThinkChunk, void, undefined>;
/**
 * Structured output via Zod schema — type-safe JSON extraction.
 * @param tier - 模型层级（默认 "fast"）
 */
export declare function generateStructured<T>(messages: ChatMessage[], schema: z.ZodType<T>, opts?: {
    temperature?: number;
    timeout?: number;
    schemaName?: string;
    schemaDescription?: string;
    tier?: ModelTier;
}): Promise<{
    object: T;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}>;
/**
 * AI call with native function calling (tool use).
 * @param tier - 模型层级（默认 "chat"）
 */
export declare function generateWithTools(messages: ChatMessage[], tools: Record<string, any>, opts?: {
    temperature?: number;
    timeout?: number;
    maxSteps?: number;
    tier?: ModelTier;
}): Promise<{
    text: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}>;
/**
 * 手动 tool call 循环（绕过 AI SDK maxSteps 的 DashScope 兼容性 bug）
 * @param opts.tier - 模型层级，默认 "chat"
 */
export declare function streamWithTools(messages: ChatMessage[], tools: Record<string, any>, opts?: {
    temperature?: number;
    maxSteps?: number;
    deepThink?: boolean;
    thinkingBudget?: number;
    tier?: ModelTier;
}): AsyncGenerator<string, void, undefined>;
/**
 * Streaming AI call with tools + deep thinking, yielding typed chunks.
 * 使用 chat 层级模型。
 */
export declare function streamWithToolsDeepThink(messages: ChatMessage[], tools: Record<string, any>, opts?: {
    temperature?: number;
    maxSteps?: number;
    thinkingBudget?: number;
}): AsyncGenerator<DeepThinkChunk, void, undefined>;
export { getProvider, getTier, isReasoningModel, Priority };
