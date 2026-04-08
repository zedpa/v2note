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
import { generateText, streamText, generateObject, type ModelMessage } from "ai";
import type { z } from "zod";
import { Semaphore, Priority } from "../lib/semaphore.js";

// DashScope LLM 并发控制（DashScope API 支持 1000 并发，此处限制单 worker 上限防止内存暴涨）
const llmSemaphore = new Semaphore(50);

/** 根据 ModelTier 映射默认优先级 */
function tierPriority(tier: ModelTier): Priority {
  switch (tier) {
    case "chat":
    case "agent":
      return Priority.HIGH;
    default:
      return Priority.NORMAL;
  }
}

// ── Types ──────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
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
  reasoning: boolean;   // 是否启用推理（thinking）
  timeout: number;
}

// ── 推理模型检测 ─────────────────────────────────────────────

/** 匹配推理系列模型名 */
const REASONING_MODEL_PATTERNS = [/qwen3\.\d/, /qwen3-/, /qwen3\.5/];

function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_PATTERNS.some((p) => p.test(model));
}

// ── Provider 初始化 ──────────────────────────────────────────

let _provider: ReturnType<typeof createOpenAI> | null = null;
let _tiers: Record<ModelTier, TierConfig> | null = null;
let _defaultModel: string | null = null;
let _defaultTimeout: number | null = null;

function ensureProvider() {
  if (_provider !== null) return;

  const apiKey = process.env.DASHSCOPE_API_KEY ?? "";
  const baseUrl = process.env.AI_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
  _defaultModel = process.env.AI_MODEL ?? "qwen-plus";
  _defaultTimeout = parseInt(process.env.AI_TIMEOUT ?? "60000", 10);

  if (!apiKey) {
    console.warn("[ai] WARNING: DASHSCOPE_API_KEY is not set — AI calls will fail!");
  }

  _provider = createOpenAI({ apiKey, baseURL: baseUrl, name: "dashscope" });

  // 读取各层级模型配置
  const fast = process.env.AI_MODEL_FAST ?? _defaultModel;
  const agent = process.env.AI_MODEL_AGENT ?? _defaultModel;
  const chat = process.env.AI_MODEL_CHAT ?? _defaultModel;
  const report = process.env.AI_MODEL_REPORT ?? _defaultModel;
  const background = process.env.AI_MODEL_BACKGROUND ?? _defaultModel;
  const vision = process.env.AI_MODEL_VISION ?? "qwen-vl-max";

  _tiers = {
    fast:       { model: fast,       reasoning: false, timeout: _defaultTimeout },
    agent:      { model: agent,      reasoning: false, timeout: _defaultTimeout * 2 },
    chat:       { model: chat,       reasoning: true,  timeout: _defaultTimeout * 3 },
    report:     { model: report,     reasoning: true,  timeout: _defaultTimeout * 3 },
    background: { model: background, reasoning: false, timeout: _defaultTimeout },
    vision:     { model: vision,     reasoning: false, timeout: _defaultTimeout },
  };

  console.log("[ai] Provider ready (multi-model):");
  for (const [tier, cfg] of Object.entries(_tiers)) {
    const isReasoning = isReasoningModel(cfg.model);
    const thinkLabel = isReasoning ? (cfg.reasoning ? "thinking:ON" : "thinking:OFF") : "non-reasoning";
    console.log(`  ${tier.padEnd(12)} → ${cfg.model} (${thinkLabel}, timeout=${cfg.timeout}ms)`);
  }
}

/** 获取指定层级的配置 */
function getTier(tier: ModelTier): { provider: ReturnType<typeof createOpenAI>; config: TierConfig } {
  ensureProvider();
  return { provider: _provider!, config: _tiers![tier] };
}

/** 兼容旧接口：无 tier 时使用 fast */
function getProvider() {
  ensureProvider();
  return { provider: _provider!, model: _defaultModel!, timeout: _defaultTimeout! };
}

// ── 工具函数 ─────────────────────────────────────────────────

function mapUsage(usage: { inputTokens?: number; outputTokens?: number } | undefined) {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.inputTokens ?? 0,
    completion_tokens: usage.outputTokens ?? 0,
  };
}

/**
 * 构建 providerOptions：
 * - 推理模型 + reasoning=true → enable_thinking: true
 * - 推理模型 + reasoning=false → enable_thinking: false（关闭推理，大幅降低延迟）
 * - 非推理模型 → 不传 enable_thinking
 * - json=true + 非推理模型 → response_format: json_object
 * - json=true + 推理模型 → 不设 response_format（靠 prompt 约束）
 */
function buildProviderOptions(model: string, reasoning: boolean, json?: boolean, thinkingBudget?: number): Record<string, any> | undefined {
  const isReasoning = isReasoningModel(model);
  const opts: Record<string, any> = {};

  if (isReasoning) {
    opts.enable_thinking = reasoning;
    if (reasoning && thinkingBudget) {
      opts.thinking_budget = thinkingBudget;
    }
  }

  if (json && !isReasoning) {
    opts.response_format = { type: "json_object" };
  }

  if (Object.keys(opts).length === 0) return undefined;
  return { openai: opts };
}

// ── 公共 API ─────────────────────────────────────────────────

/**
 * Non-streaming AI call.
 * @param tier - 模型层级（默认 "fast"）
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { json?: boolean; temperature?: number; timeout?: number; tier?: ModelTier },
): Promise<AIResponse> {
  const tier = opts?.tier ?? "fast";
  return llmSemaphore.acquire(async () => {
    const { provider, config } = getTier(tier);
    const effectiveTimeout = opts?.timeout ?? config.timeout;

    const providerOptions = buildProviderOptions(config.model, config.reasoning, opts?.json);

    const result = await generateText({
      model: provider.chat(config.model),
      messages: messages as ModelMessage[],
      temperature: opts?.temperature ?? 0.7,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(effectiveTimeout),
      ...(providerOptions ? { providerOptions } : {}),
    });

    const content = result.text ?? "";
    if (!content) {
      console.warn(`[ai][${tier}] AI returned empty content`, { model: config.model, usage: result.usage });
    }

    return { content, usage: mapUsage(result.usage) };
  }, { priority: tierPriority(tier) });
}

/**
 * Streaming AI call. Yields text chunks.
 * @param tier - 模型层级（默认 "chat"）
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  opts?: { temperature?: number; tier?: ModelTier },
): AsyncGenerator<string, void, undefined> {
  const tier = opts?.tier ?? "chat";
  const { provider, config } = getTier(tier);

  const providerOptions = buildProviderOptions(config.model, config.reasoning);

  const result = streamText({
    model: provider.chat(config.model),
    messages: messages as ModelMessage[],
    temperature: opts?.temperature ?? 0.7,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(config.timeout),
    ...(providerOptions ? { providerOptions } : {}),
  });

  for await (const chunk of result.textStream) {
    if (chunk) yield chunk;
  }
}

/**
 * Streaming AI call with deep thinking (Qwen enable_thinking).
 * 始终启用推理，使用 chat 层级模型。
 */
export async function* chatCompletionStreamDeepThink(
  messages: ChatMessage[],
  opts?: { temperature?: number; thinkingBudget?: number },
): AsyncGenerator<DeepThinkChunk, void, undefined> {
  const { provider, config } = getTier("chat");

  const result = streamText({
    model: provider.chat(config.model),
    messages: messages as ModelMessage[],
    temperature: opts?.temperature ?? 0.7,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(config.timeout),
    providerOptions: {
      openai: {
        enable_thinking: true,
        thinking_budget: opts?.thinkingBudget ?? 4096,
      },
    },
  });

  // AI SDK fullStream 统一消费 reasoning + text chunk
  for await (const part of result.fullStream) {
    switch ((part as any).type) {
      case "reasoning-delta":
        if ((part as any).text) yield { type: "thinking", content: (part as any).text };
        break;
      case "text-delta":
        if ((part as any).text) yield { type: "text", content: (part as any).text };
        break;
    }
  }
}

/**
 * Structured output via Zod schema — type-safe JSON extraction.
 * @param tier - 模型层级（默认 "fast"）
 */
export async function generateStructured<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  opts?: { temperature?: number; timeout?: number; schemaName?: string; schemaDescription?: string; tier?: ModelTier },
): Promise<{ object: T; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const tier = opts?.tier ?? "fast";
  return llmSemaphore.acquire(async () => {
    const { provider, config } = getTier(tier);
    const effectiveTimeout = opts?.timeout ?? config.timeout;

    const result = await generateObject({
      model: provider.chat(config.model),
      messages: messages as ModelMessage[],
      schema,
      schemaName: opts?.schemaName,
      schemaDescription: opts?.schemaDescription,
      temperature: opts?.temperature ?? 0.3,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(effectiveTimeout),
    });

    return { object: result.object, usage: mapUsage(result.usage) };
  }, { priority: tierPriority(tier) });
}

/**
 * AI call with native function calling (tool use).
 * @param tier - 模型层级（默认 "chat"）
 */
export async function generateWithTools(
  messages: ChatMessage[],
  tools: Record<string, any>,
  opts?: { temperature?: number; timeout?: number; maxSteps?: number; tier?: ModelTier },
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const tier = opts?.tier ?? "chat";
  const { provider, config } = getTier(tier);
  const effectiveTimeout = opts?.timeout ?? config.timeout;

  const providerOptions = buildProviderOptions(config.model, config.reasoning);

  const result = await generateText({
    model: provider.chat(config.model),
    messages: messages as ModelMessage[],
    tools,
    temperature: opts?.temperature ?? 0.7,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(effectiveTimeout),
    maxSteps: opts?.maxSteps ?? 5,
    ...(providerOptions ? { providerOptions } : {}),
  } as any);

  return { text: result.text ?? "", usage: mapUsage(result.usage) };
}

// ── Tool 名称 → 用户可见的中文提示 ──────────────────────────

const TOOL_LABELS: Record<string, string> = {
  // ── 已有 ──
  web_search:      "🔍 正在联网搜索…",
  fetch_url:       "🌐 正在获取网页内容…",
  search:          "📋 正在查找相关记录…",
  create_todo:     "✏️ 正在创建待办…",
  create_goal:     "🎯 正在创建目标…",
  create_project:  "📁 正在创建项目…",
  update_todo:     "✏️ 正在更新待办…",
  update_goal:     "🎯 正在更新目标…",
  delete_record:   "🗑️ 正在删除…",
  // ── 补全现有缺失 ──
  create_record:   "📝 正在创建日记…",
  update_record:   "📝 正在更新日记…",
  delete_todo:     "🗑️ 正在取消待办…",
  create_link:     "🔗 正在建立关联…",
  confirm:         "✅ 正在处理确认…",
  // ── 新增/合并工具 ──
  get_current_time: "🕐 正在获取时间…",
  view:            "📖 正在查看详情…",
  update_user_info:"👤 正在更新用户信息…",
  save_conversation: "📝 正在保存对话内容…",
  manage_folder:   "📂 正在管理分类…",
  move_record:     "📂 正在移动日记…",
  list_folders:    "📂 正在查看分类…",
};

/**
 * 手动 tool call 循环（绕过 AI SDK maxSteps 的 DashScope 兼容性 bug）
 * @param opts.tier - 模型层级，默认 "chat"
 */
export async function* streamWithTools(
  messages: ChatMessage[],
  tools: Record<string, any>,
  opts?: { temperature?: number; maxSteps?: number; tier?: ModelTier },
): AsyncGenerator<string, void, undefined> {
  const { provider, config } = getTier(opts?.tier ?? "chat");
  const maxSteps = opts?.maxSteps ?? 5;

  // DashScope thinking + tools 已知 bug：
  // 1. thinking 模式下 tool call 60% 失败率 (Qwen3 #1817)
  // 2. reasoning_content 泄漏到 content (Qwen3.5 #26)
  // 3. 流式 + thinking 时缓冲整个推理阶段，fullStream 无输出→用户看到"无响应"
  // 深度推理需求走 streamDeepSkill（纯文本流，无工具，不受此限制）。
  // TODO: DashScope 修复后或切换 Anthropic provider 后，可改为 enable_thinking: true
  const reasoningOpts = isReasoningModel(config.model)
    ? { providerOptions: { openai: { enable_thinking: false } } }
    : {};

  let currentMessages = [...messages] as any[];

  for (let step = 0; step < maxSteps; step++) {
    const result = streamText({
      model: provider.chat(config.model),
      messages: currentMessages as ModelMessage[],
      tools,
      temperature: opts?.temperature ?? 0.7,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(config.timeout),
      maxSteps: 1,
      ...reasoningOpts,
    } as any);

    const toolInputBuffers = new Map<string, { name: string; args: string }>();
    let hasToolCalls = false;
    let textGenerated = false;

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta":
            if ((part as any).text) {
              textGenerated = true;
              yield (part as any).text;
            }
            break;
          case "tool-input-start": {
            const p = part as any;
            const id = p.toolCallId ?? p.id;
            toolInputBuffers.set(id, { name: p.toolName, args: "" });
            break;
          }
          case "tool-input-delta": {
            const p = part as any;
            const id = p.toolCallId ?? p.id;
            const buf = toolInputBuffers.get(id);
            if (buf) buf.args += (p.inputTextDelta ?? p.delta ?? "");
            break;
          }
          case "tool-call": {
            hasToolCalls = true;
            // Fallback: 如果模型不支持流式 tool args（MiniMax 等），
            // 直接从 tool-call 事件提取完整参数
            const tc = part as any;
            const tcId = tc.toolCallId ?? tc.id;
            if (tcId && tc.toolName && !toolInputBuffers.has(tcId)) {
              // AI SDK tool-call 事件用 input 字段（可能是 string 或 object）
              const rawInput = tc.input ?? tc.args ?? {};
              toolInputBuffers.set(tcId, {
                name: tc.toolName,
                args: typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput),
              });
            }
            break;
          }
          // 推理 chunk：当前 DashScope 关闭了 thinking 不会产生，
          // 但为将来切换 provider（Anthropic interleaved thinking）或 DashScope 修复后预留。
          case "reasoning-delta": {
            const r = part as any;
            if (r.text) {
              yield `\x00THINKING:${r.text}`;
            }
            break;
          }
          case "reasoning-start":
          case "reasoning-end":
          case "start-step":
          case "finish-step":
            // 已知的控制类 chunk，安全忽略
            break;
        }
      }
    } catch (err: any) {
      console.error(`[ai] Stream error at step ${step}:`, err.message);
      yield `\n\n⚠️ AI 响应中断: ${err.message}\n\n`;
      return;
    }

    if (!hasToolCalls || toolInputBuffers.size === 0) {
      return;
    }

    const toolResultMessages: any[] = [];

    for (const [callId, { name, args: rawArgs }] of toolInputBuffers) {
      const label = TOOL_LABELS[name] ?? `正在执行 ${name}…`;
      yield `\x00TOOL_STATUS:${name}:${label}:${callId}`;
      console.log(`[ai] Tool call step=${step}: ${name}(${rawArgs.slice(0, 100)})`);

      let parsedArgs: any = {};
      try {
        parsedArgs = rawArgs.trim() ? JSON.parse(rawArgs) : {};
      } catch {
        console.warn(`[ai] Failed to parse tool args for ${name}: ${rawArgs.slice(0, 100)}`);
      }

      const toolStartTime = Date.now();
      let toolResult: any = { success: false, message: "工具执行失败" };
      try {
        const toolDef = tools[name];
        if (toolDef?.execute) {
          toolResult = await toolDef.execute(parsedArgs, { toolCallId: callId });
        }
      } catch (err: any) {
        console.error(`[ai] Tool "${name}" execution error:`, err.message);
        toolResult = { success: false, message: `工具执行失败: ${err.message}` };
      }
      const durationMs = Date.now() - toolStartTime;
      console.log(`[ai] Tool result: ${name} →`, JSON.stringify(toolResult).slice(0, 150));

      // 发送 TOOL_DONE 标记（success:message:durationMs）
      const toolSuccess = toolResult?.success !== false;
      const toolMessage = (toolResult?.message ?? "").replace(/:/g, "：");
      yield `\x00TOOL_DONE:${name}:${callId}:${toolSuccess}:${toolMessage}:${durationMs}`;

      toolResultMessages.push({
        tool_call_id: callId,
        toolName: name,
        content: JSON.stringify(toolResult),
      });
    }

    const assistantContent: any[] = [];
    for (const [callId, { name, args: rawArgs }] of toolInputBuffers) {
      assistantContent.push({
        type: "tool-call",
        toolCallId: callId,
        toolName: name,
        input: (() => { try { return JSON.parse(rawArgs || "{}"); } catch { return {}; } })(),
      });
    }

    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: assistantContent },
      ...toolResultMessages.map((tr: any) => ({
        role: "tool" as const,
        content: [{
          type: "tool-result" as const,
          toolCallId: tr.tool_call_id,
          toolName: tr.toolName,
          output: { type: "text" as const, value: tr.content },
        }],
      })),
    ];
  }

  console.warn(`[ai] maxSteps (${maxSteps}) exhausted`);
}

/**
 * Streaming AI call with tools + deep thinking, yielding typed chunks.
 * 使用 chat 层级模型。
 */
export async function* streamWithToolsDeepThink(
  messages: ChatMessage[],
  tools: Record<string, any>,
  opts?: { temperature?: number; maxSteps?: number; thinkingBudget?: number },
): AsyncGenerator<DeepThinkChunk, void, undefined> {
  const { provider, config } = getTier("chat");

  const result = streamText({
    model: provider.chat(config.model),
    messages: messages as ModelMessage[],
    tools,
    temperature: opts?.temperature ?? 0.7,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(config.timeout),
    maxSteps: opts?.maxSteps ?? 5,
    providerOptions: {
      openai: {
        enable_thinking: true,
        thinking_budget: opts?.thinkingBudget ?? 4096,
      },
    },
  } as any);

  // ⚠️ 注意：DashScope thinking + tools 有已知 bug（见 streamWithTools 注释），
  // 此函数目前未被调用。保留作为切换 Anthropic provider 后的入口。
  for await (const part of result.fullStream) {
    switch ((part as any).type) {
      case "reasoning-delta":
        if ((part as any).text) yield { type: "thinking", content: (part as any).text };
        break;
      case "text-delta":
        if ((part as any).text) yield { type: "text", content: (part as any).text };
        break;
    }
  }
}

// Re-export for convenience
export { getProvider, getTier, isReasoningModel, Priority };
