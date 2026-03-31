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
import { generateText, streamText, generateObject } from "ai";
// ── 推理模型检测 ─────────────────────────────────────────────
/** 匹配推理系列模型名 */
const REASONING_MODEL_PATTERNS = [/qwen3\.\d/, /qwen3-/, /qwen3\.5/];
function isReasoningModel(model) {
    return REASONING_MODEL_PATTERNS.some((p) => p.test(model));
}
// ── Provider 初始化 ──────────────────────────────────────────
let _provider = null;
let _tiers = null;
let _defaultModel = null;
let _defaultTimeout = null;
function ensureProvider() {
    if (_provider !== null)
        return;
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
        fast: { model: fast, reasoning: false, timeout: _defaultTimeout },
        agent: { model: agent, reasoning: false, timeout: _defaultTimeout * 2 },
        chat: { model: chat, reasoning: true, timeout: _defaultTimeout * 3 },
        report: { model: report, reasoning: true, timeout: _defaultTimeout * 3 },
        background: { model: background, reasoning: false, timeout: _defaultTimeout },
        vision: { model: vision, reasoning: false, timeout: _defaultTimeout },
    };
    console.log("[ai] Provider ready (multi-model):");
    for (const [tier, cfg] of Object.entries(_tiers)) {
        const isReasoning = isReasoningModel(cfg.model);
        const thinkLabel = isReasoning ? (cfg.reasoning ? "thinking:ON" : "thinking:OFF") : "non-reasoning";
        console.log(`  ${tier.padEnd(12)} → ${cfg.model} (${thinkLabel}, timeout=${cfg.timeout}ms)`);
    }
}
/** 获取指定层级的配置 */
function getTier(tier) {
    ensureProvider();
    return { provider: _provider, config: _tiers[tier] };
}
/** 兼容旧接口：无 tier 时使用 fast */
function getProvider() {
    ensureProvider();
    return { provider: _provider, model: _defaultModel, timeout: _defaultTimeout };
}
// ── 工具函数 ─────────────────────────────────────────────────
function mapUsage(usage) {
    if (!usage)
        return undefined;
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
function buildProviderOptions(model, reasoning, json, thinkingBudget) {
    const isReasoning = isReasoningModel(model);
    const opts = {};
    if (isReasoning) {
        opts.enable_thinking = reasoning;
        if (reasoning && thinkingBudget) {
            opts.thinking_budget = thinkingBudget;
        }
    }
    if (json && !isReasoning) {
        opts.response_format = { type: "json_object" };
    }
    if (Object.keys(opts).length === 0)
        return undefined;
    return { openai: opts };
}
// ── 公共 API ─────────────────────────────────────────────────
/**
 * Non-streaming AI call.
 * @param tier - 模型层级（默认 "fast"）
 */
export async function chatCompletion(messages, opts) {
    const tier = opts?.tier ?? "fast";
    const { provider, config } = getTier(tier);
    const effectiveTimeout = opts?.timeout ?? config.timeout;
    const providerOptions = buildProviderOptions(config.model, config.reasoning, opts?.json);
    const result = await generateText({
        model: provider.chat(config.model),
        messages: messages,
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
}
/**
 * Streaming AI call. Yields text chunks.
 * @param tier - 模型层级（默认 "chat"）
 */
export async function* chatCompletionStream(messages, opts) {
    const tier = opts?.tier ?? "chat";
    const { provider, config } = getTier(tier);
    const providerOptions = buildProviderOptions(config.model, config.reasoning);
    const result = streamText({
        model: provider.chat(config.model),
        messages: messages,
        temperature: opts?.temperature ?? 0.7,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(config.timeout),
        ...(providerOptions ? { providerOptions } : {}),
    });
    for await (const chunk of result.textStream) {
        if (chunk)
            yield chunk;
    }
}
/**
 * Streaming AI call with deep thinking (Qwen enable_thinking).
 * 始终启用推理，使用 chat 层级模型。
 */
export async function* chatCompletionStreamDeepThink(messages, opts) {
    const { provider, config } = getTier("chat");
    const result = streamText({
        model: provider.chat(config.model),
        messages: messages,
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
    const streamResult = result;
    if (streamResult.reasoningStream) {
        try {
            for await (const chunk of streamResult.reasoningStream) {
                if (chunk)
                    yield { type: "thinking", content: chunk };
            }
        }
        catch {
            // reasoningStream not supported — fall through to textStream
        }
    }
    for await (const chunk of result.textStream) {
        if (chunk)
            yield { type: "text", content: chunk };
    }
}
/**
 * Structured output via Zod schema — type-safe JSON extraction.
 * @param tier - 模型层级（默认 "fast"）
 */
export async function generateStructured(messages, schema, opts) {
    const tier = opts?.tier ?? "fast";
    const { provider, config } = getTier(tier);
    const effectiveTimeout = opts?.timeout ?? config.timeout;
    const result = await generateObject({
        model: provider.chat(config.model),
        messages: messages,
        schema,
        schemaName: opts?.schemaName,
        schemaDescription: opts?.schemaDescription,
        temperature: opts?.temperature ?? 0.3,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(effectiveTimeout),
    });
    return { object: result.object, usage: mapUsage(result.usage) };
}
/**
 * AI call with native function calling (tool use).
 * @param tier - 模型层级（默认 "chat"）
 */
export async function generateWithTools(messages, tools, opts) {
    const tier = opts?.tier ?? "chat";
    const { provider, config } = getTier(tier);
    const effectiveTimeout = opts?.timeout ?? config.timeout;
    const providerOptions = buildProviderOptions(config.model, config.reasoning);
    const result = await generateText({
        model: provider.chat(config.model),
        messages: messages,
        tools,
        temperature: opts?.temperature ?? 0.7,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(effectiveTimeout),
        maxSteps: opts?.maxSteps ?? 5,
        ...(providerOptions ? { providerOptions } : {}),
    });
    return { text: result.text ?? "", usage: mapUsage(result.usage) };
}
// ── Tool 名称 → 用户可见的中文提示 ──────────────────────────
const TOOL_LABELS = {
    web_search: "🔍 正在联网搜索…",
    fetch_url: "🌐 正在获取网页内容…",
    search: "📋 正在查找相关记录…",
    create_todo: "✏️ 正在创建待办…",
    create_goal: "🎯 正在创建目标…",
    create_project: "📁 正在创建项目…",
    update_todo: "✏️ 正在更新待办…",
    update_goal: "🎯 正在更新目标…",
    delete_record: "🗑️ 正在删除…",
};
/**
 * 手动 tool call 循环（绕过 AI SDK maxSteps 的 DashScope 兼容性 bug）
 * @param opts.tier - 模型层级，默认 "chat"
 */
export async function* streamWithTools(messages, tools, opts) {
    const { provider, config } = getTier(opts?.tier ?? "chat");
    const maxSteps = opts?.maxSteps ?? 5;
    const deepThinkOptions = opts?.deepThink
        ? {
            providerOptions: {
                openai: {
                    enable_thinking: true,
                    thinking_budget: opts?.thinkingBudget ?? 4096,
                },
            },
        }
        : {
            // chat 层级默认启用推理
            ...(isReasoningModel(config.model) ? {
                providerOptions: {
                    openai: { enable_thinking: config.reasoning },
                },
            } : {}),
        };
    let currentMessages = [...messages];
    for (let step = 0; step < maxSteps; step++) {
        const result = streamText({
            model: provider.chat(config.model),
            messages: currentMessages,
            tools,
            temperature: opts?.temperature ?? 0.7,
            maxRetries: 1,
            abortSignal: AbortSignal.timeout(config.timeout),
            maxSteps: 1,
            ...deepThinkOptions,
        });
        const toolInputBuffers = new Map();
        let hasToolCalls = false;
        let textGenerated = false;
        try {
            for await (const part of result.fullStream) {
                switch (part.type) {
                    case "text-delta":
                        if (part.text) {
                            textGenerated = true;
                            yield part.text;
                        }
                        break;
                    case "tool-input-start": {
                        const p = part;
                        const id = p.toolCallId ?? p.id;
                        toolInputBuffers.set(id, { name: p.toolName, args: "" });
                        break;
                    }
                    case "tool-input-delta": {
                        const p = part;
                        const id = p.toolCallId ?? p.id;
                        const buf = toolInputBuffers.get(id);
                        if (buf)
                            buf.args += (p.inputTextDelta ?? p.delta ?? "");
                        break;
                    }
                    case "tool-call": {
                        hasToolCalls = true;
                        // Fallback: 如果模型不支持流式 tool args（MiniMax 等），
                        // 直接从 tool-call 事件提取完整参数
                        const tc = part;
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
                }
            }
        }
        catch (err) {
            console.error(`[ai] Stream error at step ${step}:`, err.message);
            yield `\n\n⚠️ AI 响应中断: ${err.message}\n\n`;
            return;
        }
        if (!hasToolCalls || toolInputBuffers.size === 0) {
            return;
        }
        const toolResultMessages = [];
        for (const [callId, { name, args: rawArgs }] of toolInputBuffers) {
            const label = TOOL_LABELS[name] ?? `正在执行 ${name}…`;
            yield `\x00TOOL_STATUS:${name}:${label}`;
            console.log(`[ai] Tool call step=${step}: ${name}(${rawArgs.slice(0, 100)})`);
            let parsedArgs = {};
            try {
                parsedArgs = rawArgs.trim() ? JSON.parse(rawArgs) : {};
            }
            catch {
                console.warn(`[ai] Failed to parse tool args for ${name}: ${rawArgs.slice(0, 100)}`);
            }
            let toolResult = { success: false, message: "工具执行失败" };
            try {
                const toolDef = tools[name];
                if (toolDef?.execute) {
                    toolResult = await toolDef.execute(parsedArgs, { toolCallId: callId });
                }
            }
            catch (err) {
                console.error(`[ai] Tool "${name}" execution error:`, err.message);
                toolResult = { success: false, message: `工具执行失败: ${err.message}` };
            }
            console.log(`[ai] Tool result: ${name} →`, JSON.stringify(toolResult).slice(0, 150));
            toolResultMessages.push({
                tool_call_id: callId,
                toolName: name,
                content: JSON.stringify(toolResult),
            });
        }
        const assistantContent = [];
        for (const [callId, { name, args: rawArgs }] of toolInputBuffers) {
            assistantContent.push({
                type: "tool-call",
                toolCallId: callId,
                toolName: name,
                input: (() => { try {
                    return JSON.parse(rawArgs || "{}");
                }
                catch {
                    return {};
                } })(),
            });
        }
        currentMessages = [
            ...currentMessages,
            { role: "assistant", content: assistantContent },
            ...toolResultMessages.map((tr) => ({
                role: "tool",
                content: [{
                        type: "tool-result",
                        toolCallId: tr.tool_call_id,
                        toolName: tr.toolName,
                        output: { type: "text", value: tr.content },
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
export async function* streamWithToolsDeepThink(messages, tools, opts) {
    const { provider, config } = getTier("chat");
    const result = streamText({
        model: provider.chat(config.model),
        messages: messages,
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
    });
    const streamResult = result;
    if (streamResult.reasoningStream) {
        try {
            for await (const chunk of streamResult.reasoningStream) {
                if (chunk)
                    yield { type: "thinking", content: chunk };
            }
        }
        catch {
            // reasoningStream not supported
        }
    }
    for await (const chunk of result.textStream) {
        if (chunk)
            yield { type: "text", content: chunk };
    }
}
// Re-export for convenience
export { getProvider, getTier, isReasoningModel };
//# sourceMappingURL=provider.js.map