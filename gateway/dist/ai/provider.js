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
        model: provider(model),
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
        model: provider(model),
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
        model: provider(model),
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
// Re-export for convenience
export { getProvider };
//# sourceMappingURL=provider.js.map