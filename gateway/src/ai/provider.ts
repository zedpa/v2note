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
  provider?: string;    // 指定 provider 名称（不配则用默认 dashscope）
}

// ── 推理模型检测 ─────────────────────────────────────────────

/** 匹配推理系列模型名（Qwen3 + DeepSeek-Reasoner） */
const REASONING_MODEL_PATTERNS = [
  /qwen3\.\d/, /qwen3-/, /qwen3\.5/,     // Qwen3 系列
  /deepseek-reason/,                       // DeepSeek 推理模型
];

function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_PATTERNS.some((p) => p.test(model));
}

// ── Provider 初始化 ──────────────────────────────────────────

/** 多 Provider 注册表 */
const _providers = new Map<string, ReturnType<typeof createOpenAI>>();

/** 默认 provider 名称 */
const DEFAULT_PROVIDER_NAME = "dashscope";

let _provider: ReturnType<typeof createOpenAI> | null = null;
let _tiers: Record<ModelTier, TierConfig> | null = null;
let _defaultModel: string | null = null;
let _defaultTimeout: number | null = null;

/** 已知 provider 的默认 BASE_URL */
const PROVIDER_DEFAULT_URLS: Record<string, string> = {
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  deepseek: "https://api.deepseek.com",
};

/**
 * 从注册表获取或创建 provider 实例。
 * 读取 `${NAME.toUpperCase()}_API_KEY` 和 `${NAME.toUpperCase()}_BASE_URL` 环境变量。
 * 如果 API key 不存在，返回 null。
 */
function getOrCreateProvider(name: string): ReturnType<typeof createOpenAI> | null {
  if (_providers.has(name)) return _providers.get(name)!;

  // dashscope 使用独立的环境变量名
  const envPrefix = name.toUpperCase();
  const apiKey = name === "dashscope"
    ? (process.env.DASHSCOPE_API_KEY ?? "")
    : (process.env[`${envPrefix}_API_KEY`] ?? "");

  if (!apiKey) {
    return null;
  }

  const baseUrl = name === "dashscope"
    ? (process.env.AI_BASE_URL ?? PROVIDER_DEFAULT_URLS.dashscope)
    : (process.env[`${envPrefix}_BASE_URL`] ?? PROVIDER_DEFAULT_URLS[name] ?? "");

  const p = createOpenAI({ apiKey, baseURL: baseUrl, name });
  _providers.set(name, p);
  return p;
}

function ensureProvider() {
  if (_provider !== null) return;

  _defaultModel = process.env.AI_MODEL ?? "qwen-plus";
  _defaultTimeout = parseInt(process.env.AI_TIMEOUT ?? "60000", 10);

  // 注册默认 provider（dashscope）
  const dashscope = getOrCreateProvider("dashscope");
  if (!dashscope) {
    console.warn("[ai] WARNING: DASHSCOPE_API_KEY is not set — AI calls will fail!");
    // 仍创建一个空 key 的 provider 以避免 null 崩溃
    _provider = createOpenAI({
      apiKey: "",
      baseURL: process.env.AI_BASE_URL ?? PROVIDER_DEFAULT_URLS.dashscope,
      name: "dashscope",
    });
    _providers.set("dashscope", _provider);
  } else {
    _provider = dashscope;
  }

  // 尝试注册其他已知 provider（GLM, DeepSeek）
  for (const name of ["glm", "deepseek"]) {
    const p = getOrCreateProvider(name);
    if (!p) {
      console.log(`[ai] ${name} provider not configured, skipping`);
    }
  }

  // 读取各层级模型配置 + provider 映射
  const fast = process.env.AI_MODEL_FAST ?? _defaultModel;
  const agent = process.env.AI_MODEL_AGENT ?? _defaultModel;
  const chat = process.env.AI_MODEL_CHAT ?? _defaultModel;
  const report = process.env.AI_MODEL_REPORT ?? _defaultModel;
  const background = process.env.AI_MODEL_BACKGROUND ?? _defaultModel;
  const vision = process.env.AI_MODEL_VISION ?? "qwen-vl-max";

  // 从 AI_PROVIDER_${TIER} 环境变量读取每层级的 provider 映射
  const getProviderForTier = (tierName: string): string | undefined => {
    const envKey = `AI_PROVIDER_${tierName.toUpperCase()}`;
    const providerName = process.env[envKey];
    if (!providerName) return undefined;
    // 检查 provider 是否可用（有 key）
    if (_providers.has(providerName)) return providerName;
    // provider 不可用，fallback 到默认
    console.warn(`[ai] ${envKey}=${providerName} but provider not available (no API key), fallback to dashscope`);
    return undefined;
  };

  _tiers = {
    fast:       { model: fast,       reasoning: false, timeout: _defaultTimeout,     provider: getProviderForTier("fast") },
    agent:      { model: agent,      reasoning: false, timeout: _defaultTimeout * 2, provider: getProviderForTier("agent") },
    chat:       { model: chat,       reasoning: true,  timeout: _defaultTimeout * 3, provider: getProviderForTier("chat") },
    report:     { model: report,     reasoning: true,  timeout: _defaultTimeout * 3, provider: getProviderForTier("report") },
    background: { model: background, reasoning: false, timeout: _defaultTimeout,     provider: getProviderForTier("background") },
    vision:     { model: vision,     reasoning: false, timeout: _defaultTimeout,     provider: getProviderForTier("vision") },
  };

  // 启动日志：provider 注册表
  const registeredProviders = Array.from(_providers.keys());
  console.log(`[ai] Provider registry: [${registeredProviders.join(", ")}] (default: dashscope)`);
  console.log("[ai] Provider ready (multi-model):");
  for (const [tier, cfg] of Object.entries(_tiers)) {
    const isReasoning = isReasoningModel(cfg.model);
    const thinkLabel = isReasoning ? (cfg.reasoning ? "thinking:ON" : "thinking:OFF") : "non-reasoning";
    const providerLabel = cfg.provider ? `provider:${cfg.provider}` : "provider:dashscope";
    console.log(`  ${tier.padEnd(12)} → ${cfg.model} (${thinkLabel}, ${providerLabel}, timeout=${cfg.timeout}ms)`);
  }
}

/** 获取指定层级的配置，包含对应的 provider 实例 */
function getTier(tier: ModelTier): { provider: ReturnType<typeof createOpenAI>; config: TierConfig } {
  ensureProvider();
  const config = _tiers![tier];
  // 使用 tier 配置的 provider，不可用则回退到默认
  const providerName = config.provider ?? DEFAULT_PROVIDER_NAME;
  const provider = _providers.get(providerName) ?? _provider!;
  return { provider, config };
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

    // 判断当前 tier 是否使用非默认 provider（用于降级判断）
    const tierProviderName = config.provider ?? DEFAULT_PROVIDER_NAME;
    const isNonDefaultProvider = tierProviderName !== DEFAULT_PROVIDER_NAME;

    try {
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
    } catch (err: any) {
      // 降级逻辑：非默认 provider 失败时，自动降级到默认 provider 重试一次
      if (isNonDefaultProvider) {
        console.warn(`[ai][${tier}] ${tierProviderName} failed: ${err.message}, fallback to ${DEFAULT_PROVIDER_NAME}`);
        const fallbackProvider = _providers.get(DEFAULT_PROVIDER_NAME) ?? _provider!;
        const fallbackModel = _defaultModel!;
        const fallbackOptions = buildProviderOptions(fallbackModel, config.reasoning, opts?.json);

        const result = await generateText({
          model: fallbackProvider.chat(fallbackModel),
          messages: messages as ModelMessage[],
          temperature: opts?.temperature ?? 0.7,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(effectiveTimeout),
          ...(fallbackOptions ? { providerOptions: fallbackOptions } : {}),
        });

        const content = result.text ?? "";
        return { content, usage: mapUsage(result.usage) };
      }
      throw err;
    }
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
  save_conversation: "📝 正在保存对话内容…",
  manage_wiki_page: "📂 正在管理主题…",
  // ── 自我维护工具（silent 级别，标签仅供日志） ──
  update_soul:     "✨ 正在调整人格…",
  update_profile:  "👤 正在更新画像…",
  update_user_agent: "⚙️ 正在更新规则…",
  create_memory:   "💾 正在记录…",
  send_notification: "🔔 正在发送通知…",
};

/**
 * 手动 tool call 循环（绕过 AI SDK maxSteps 的 DashScope 兼容性 bug）
 * @param opts.tier - 模型层级，默认 "chat"
 */
export async function* streamWithTools(
  messages: ChatMessage[],
  tools: Record<string, any>,
  opts?: { temperature?: number; maxSteps?: number; tier?: ModelTier; toolChoice?: any },
): AsyncGenerator<string, void, undefined> {
  const { provider, config } = getTier(opts?.tier ?? "chat");
  const maxSteps = opts?.maxSteps ?? 5;

  // DashScope qwen3.5 系列 + tools 的 thinking 策略：
  // 不注入 enable_thinking 参数，让模型使用默认行为。
  // （显式 true/false 都有已知 bug，详见 vllm #20611）

  // 剥离 execute 函数：只传 schema 给模型，执行由我们的手动循环负责。
  // AI SDK v6 的 tool() 是 identity 函数，剥离 execute 后模型仍能识别工具。
  const schemaOnlyTools: Record<string, any> = {};
  for (const [name, def] of Object.entries(tools)) {
    const { execute, ...schema } = def as any;
    schemaOnlyTools[name] = schema;
  }

  let currentMessages = [...messages] as any[];
  console.log(`[ai] streamWithTools: tier=${opts?.tier ?? "chat"}, tools=[${Object.keys(tools).join(",")}], msgs=${currentMessages.length}`);

  for (let step = 0; step < maxSteps; step++) {
    if (step > 0) {
      console.log(`[ai] Step ${step}: sending tool results to model (${currentMessages.length} msgs)`);
      // 调试：打印每条消息的 role 和类型
      for (let i = 0; i < currentMessages.length; i++) {
        const m = currentMessages[i];
        const contentType = typeof m.content === "string"
          ? `str(${m.content.length})`
          : Array.isArray(m.content)
            ? `arr[${m.content.map((c: any) => c.type).join(",")}]`
            : typeof m.content;
        console.log(`[ai]   [${i}] role=${m.role} content=${contentType}`);
      }
    }

    // AI SDK v6: maxSteps 已替换为 stopWhen，默认 stepCountIs(1) = 单步
    const result = streamText({
      model: provider.chat(config.model),
      messages: currentMessages as ModelMessage[],
      tools: schemaOnlyTools,
      temperature: opts?.temperature ?? 0.7,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(config.timeout),
      ...(opts?.toolChoice ? { toolChoice: opts.toolChoice } : {}),
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
            const tc = part as any;
            const tcId = tc.toolCallId ?? tc.id;
            const rawInput = tc.input ?? tc.args ?? {};
            const rawArgs = typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput);
            const existing = tcId ? toolInputBuffers.get(tcId) : undefined;
            if (existing && !existing.args) {
              existing.args = rawArgs;
            } else if (tcId && tc.toolName && !existing) {
              toolInputBuffers.set(tcId, { name: tc.toolName, args: rawArgs });
            }
            break;
          }
          case "reasoning-delta": {
            const r = part as any;
            if (r.text) yield `\x00THINKING:${r.text}`;
            break;
          }
          case "reasoning-start":
          case "reasoning-end":
          case "start-step":
          case "finish-step":
            break;
        }
      }
    } catch (err: any) {
      // Step 1+ 的验证错误：打印完整错误以便调试
      if (step > 0 && err.name === "AI_InvalidPromptError") {
        console.error(`[ai] Step ${step} message validation failed. Falling back to text summary.`);
        // 回退策略：直接把工具结果当文本发给模型，绕过严格的消息格式
        const fallbackMessages = [
          ...messages,
          { role: "user" as const, content: `[工具执行结果]\n${currentMessages.slice(-1).map((m: any) =>
            Array.isArray(m.content) ? m.content.map((c: any) => JSON.stringify(c.output ?? c)).join("\n") : m.content
          ).join("\n")}\n\n请基于以上工具返回的真实数据回答用户的问题。` },
        ];
        const fallbackResult = streamText({
          model: provider.chat(config.model),
          messages: fallbackMessages as ModelMessage[],
          temperature: opts?.temperature ?? 0.7,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(config.timeout),
        } as any);
        for await (const part of fallbackResult.fullStream) {
          if (part.type === "text-delta" && (part as any).text) {
            yield (part as any).text;
          }
        }
        return;
      }
      console.error(`[ai] Stream error at step ${step}:`, err.message);
      yield `\n\n⚠️ AI 响应中断: ${err.message}\n\n`;
      return;
    }

    if (!hasToolCalls || toolInputBuffers.size === 0) {
      console.log(`[ai] Step ${step}: no tool calls, text=${textGenerated}`);
      return;
    }

    // ── 执行工具 ──

    const toolResults: Array<{ callId: string; name: string; input: any; resultJson: string }> = [];

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

      const t0 = Date.now();
      let toolResult: any = { success: false, message: "工具执行失败" };
      try {
        const toolDef = tools[name];
        if (toolDef?.execute) {
          toolResult = await toolDef.execute(parsedArgs, { toolCallId: callId });
        }
      } catch (err: any) {
        console.error(`[ai] Tool "${name}" error:`, err.message);
        toolResult = { success: false, message: `工具执行失败: ${err.message}` };
      }
      const ms = Date.now() - t0;
      const resultJson = JSON.stringify(toolResult);
      console.log(`[ai] Tool result: ${name} (${ms}ms) →`, resultJson.slice(0, 200));

      const toolSuccess = toolResult?.success !== false;
      const toolMessage = (toolResult?.message ?? "").replace(/:/g, "：");
      yield `\x00TOOL_DONE:${name}:${callId}:${toolSuccess}:${toolMessage}:${ms}`;

      toolResults.push({ callId, name, input: parsedArgs, resultJson });
    }

    // ── 构造 AI SDK v6 消息格式 ──
    // assistant message: content = [{ type: "tool-call", toolCallId, toolName, input }]
    // tool message: content = [{ type: "tool-result", toolCallId, toolName, output: { type, value } }]

    const assistantParts = toolResults.map(tr => ({
      type: "tool-call" as const,
      toolCallId: tr.callId,
      toolName: tr.name,
      input: tr.input,
    }));

    const toolResultParts = toolResults.map(tr => ({
      type: "tool-result" as const,
      toolCallId: tr.callId,
      toolName: tr.name,
      output: { type: "text" as const, value: tr.resultJson },
    }));

    console.log(`[ai] Step ${step} → ${toolResults.length} tool results, continuing to step ${step + 1}`);

    currentMessages = [
      ...currentMessages,
      { role: "assistant" as const, content: assistantParts },
      { role: "tool" as const, content: toolResultParts },
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
