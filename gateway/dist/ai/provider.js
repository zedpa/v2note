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
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, generateObject } from "ai";
// Lazy-loaded provider (populated on first AI call)
let _provider = null;
let _model = null;
let _timeout = null;
function getProvider() {
    if (_provider === null) {
        const apiKey = process.env.DASHSCOPE_API_KEY ?? "";
        const baseUrl = process.env.AI_BASE_URL ??
            "https://dashscope.aliyuncs.com/compatible-mode/v1";
        _model = process.env.AI_MODEL ?? "qwen3-max";
        _timeout = parseInt(process.env.AI_TIMEOUT ?? "60000", 10);
        if (!apiKey) {
            console.warn("[ai] WARNING: DASHSCOPE_API_KEY is not set — AI calls will fail!");
        }
        else {
            console.log(`[ai] Provider ready (AI SDK): model=${_model}, base=${baseUrl}`);
        }
        _provider = createOpenAI({
            apiKey,
            baseURL: baseUrl,
            name: "dashscope",
        });
    }
    return { provider: _provider, model: _model, timeout: _timeout };
}
function mapUsage(usage) {
    if (!usage)
        return undefined;
    return {
        prompt_tokens: usage.inputTokens ?? 0,
        completion_tokens: usage.outputTokens ?? 0,
    };
}
/**
 * Non-streaming AI call. Returns the full response.
 * Backward-compatible with the old raw-fetch interface.
 */
export async function chatCompletion(messages, opts) {
    const { provider, model, timeout } = getProvider();
    const effectiveTimeout = opts?.timeout ?? timeout;
    const result = await generateText({
        model: provider.chat(model),
        messages: messages,
        temperature: opts?.temperature ?? 0.7,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(effectiveTimeout),
        ...(opts?.json ? {
            providerOptions: {
                openai: { response_format: { type: "json_object" } },
            },
        } : {}),
    });
    const content = result.text ?? "";
    if (!content) {
        console.warn("[ai] AI returned empty content", { usage: result.usage });
    }
    return { content, usage: mapUsage(result.usage) };
}
/**
 * Streaming AI call. Yields text chunks.
 * Backward-compatible async generator interface.
 */
export async function* chatCompletionStream(messages, opts) {
    const { provider, model, timeout } = getProvider();
    const result = streamText({
        model: provider.chat(model),
        messages: messages,
        temperature: opts?.temperature ?? 0.7,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(timeout),
    });
    for await (const chunk of result.textStream) {
        if (chunk)
            yield chunk;
    }
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
export async function* chatCompletionStreamDeepThink(messages, opts) {
    const { provider, model, timeout } = getProvider();
    const result = streamText({
        model: provider.chat(model),
        messages: messages,
        temperature: opts?.temperature ?? 0.7,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(timeout * 3), // 深度思考需要更长超时
        providerOptions: {
            openai: {
                enable_thinking: true,
                thinking_budget: opts?.thinkingBudget ?? 4096,
            },
        },
    });
    // AI SDK v6: streamText result exposes reasoningStream for reasoning chunks
    const streamResult = result;
    // Try to consume reasoning stream if available
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
    // Always consume the text stream for the final answer
    for await (const chunk of result.textStream) {
        if (chunk)
            yield { type: "text", content: chunk };
    }
}
/**
 * Structured output via Zod schema — type-safe JSON extraction.
 * Uses AI SDK's generateObject() for guaranteed schema conformance.
 *
 * Usage:
 *   const result = await generateStructured(messages, todoSchema, { temperature: 0.3 });
 *   // result.object is fully typed according to the Zod schema
 */
export async function generateStructured(messages, schema, opts) {
    const { provider, model, timeout } = getProvider();
    const effectiveTimeout = opts?.timeout ?? timeout;
    const result = await generateObject({
        model: provider.chat(model),
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
 *
 * Uses Vercel AI SDK's generateText with tools + maxSteps.
 * Replaces the old manual JSON extraction + 3-round loop.
 */
export async function generateWithTools(messages, tools, opts) {
    const { provider, model, timeout } = getProvider();
    const effectiveTimeout = opts?.timeout ?? timeout;
    // maxSteps 在 AI SDK v6 运行时支持但类型定义可能未包含
    const result = await generateText({
        model: provider.chat(model),
        messages: messages,
        tools,
        temperature: opts?.temperature ?? 0.7,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(effectiveTimeout),
        maxSteps: opts?.maxSteps ?? 5,
    });
    return { text: result.text ?? "", usage: mapUsage(result.usage) };
}
/**
 * Streaming AI call with native function calling.
 *
 * Tools are executed automatically by the AI SDK between stream chunks.
 * Yields text chunks as they arrive.
 */
// Tool 名称 → 用户可见的中文提示
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
 *
 * 已知问题：@ai-sdk/openai v3 + DashScope 的 tool calling 有两个 bug：
 * 1. tool call args 始终被解析为空对象 {}（参数丢失）
 * 2. tool result 后不发起第二轮请求（maxSteps 无效）
 *
 * 本实现：手动从 fullStream 收集 tool_calls → 手动解析参数 → 手动执行 →
 *         构造带 tool result 的消息 → 发起新一轮 streamText。
 */
export async function* streamWithTools(messages, tools, opts) {
    const { provider, model, timeout } = getProvider();
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
        : {};
    // 构建 tools schema 供 DashScope function calling
    const toolDefs = Object.entries(tools).map(([name, t]) => ({
        name,
        tool: t,
    }));
    let currentMessages = [...messages];
    for (let step = 0; step < maxSteps; step++) {
        // 单步 streamText（maxSteps=1，不让 AI SDK 自动处理 tool result）
        const result = streamText({
            model: provider.chat(model),
            messages: currentMessages,
            tools,
            temperature: opts?.temperature ?? 0.7,
            maxRetries: 1,
            abortSignal: AbortSignal.timeout(opts?.deepThink ? timeout * 3 : timeout),
            maxSteps: 1,
            ...deepThinkOptions,
        });
        // 收集 tool calls 的原始参数（从 tool-input-delta 拼接）
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
                        toolInputBuffers.set(p.id, { name: p.toolName, args: "" });
                        break;
                    }
                    case "tool-input-delta": {
                        const p = part;
                        const buf = toolInputBuffers.get(p.id);
                        if (buf)
                            buf.args += p.delta;
                        break;
                    }
                    case "tool-call":
                        hasToolCalls = true;
                        break;
                }
            }
        }
        catch (err) {
            console.error(`[ai] Stream error at step ${step}:`, err.message);
            yield `\n\n⚠️ AI 响应中断: ${err.message}\n\n`;
            return;
        }
        // 没有 tool calls → 结束
        if (!hasToolCalls || toolInputBuffers.size === 0) {
            return;
        }
        // 执行 tool calls（手动解析参数 + 手动调用）
        const toolCallMessages = [];
        const toolResultMessages = [];
        for (const [callId, { name, args: rawArgs }] of toolInputBuffers) {
            // 向前端推送工具状态（特殊标记，由 gateway 层转为独立消息类型）
            const label = TOOL_LABELS[name] ?? `正在执行 ${name}…`;
            yield `\x00TOOL_STATUS:${name}:${label}`;
            console.log(`[ai] Tool call step=${step}: ${name}(${rawArgs.slice(0, 100)})`);
            // 解析参数
            let parsedArgs = {};
            try {
                parsedArgs = rawArgs.trim() ? JSON.parse(rawArgs) : {};
            }
            catch {
                console.warn(`[ai] Failed to parse tool args for ${name}: ${rawArgs.slice(0, 100)}`);
            }
            // 执行工具
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
            // 构造 OpenAI 格式的 tool_call + tool result messages
            toolCallMessages.push({
                type: "function",
                id: callId,
                function: { name, arguments: rawArgs },
            });
            toolResultMessages.push({
                tool_call_id: callId,
                toolName: name,
                content: JSON.stringify(toolResult),
            });
        }
        // 追加 AI SDK ModelMessage 格式的 tool call + result
        // assistant 消息用 content array 格式（AI SDK v6 要求）
        const assistantContent = [];
        if (textGenerated) {
            // 如果有文本输出，需要加到 content 里（但我们已经 yield 过了，这里不重复）
        }
        for (const [callId, { name, args: rawArgs }] of toolInputBuffers) {
            assistantContent.push({
                type: "tool-call",
                toolCallId: callId,
                toolName: name,
                args: (() => { try {
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
                content: [{ type: "tool-result", toolCallId: tr.tool_call_id, toolName: tr.toolName, result: tr.content }],
            })),
        ];
        // 继续下一步（AI 将基于 tool result 生成最终回答）
    }
    console.warn(`[ai] maxSteps (${maxSteps}) exhausted`);
}
/**
 * Streaming AI call with tools + deep thinking, yielding typed chunks.
 *
 * Same as streamWithTools but returns DeepThinkChunk with thinking/text distinction.
 */
export async function* streamWithToolsDeepThink(messages, tools, opts) {
    const { provider, model, timeout } = getProvider();
    const result = streamText({
        model: provider.chat(model),
        messages: messages,
        tools,
        temperature: opts?.temperature ?? 0.7,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(timeout * 3),
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
export { getProvider };
//# sourceMappingURL=provider.js.map