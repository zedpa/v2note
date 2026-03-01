/**
 * AI provider — calls qwen-plus via OpenAI-compatible API.
 *
 * Environment variables are read lazily (on first call) because
 * dotenv.config() in index.ts runs AFTER ESM imports are resolved.
 */
// Lazy-loaded config (populated on first AI call)
let _apiKey = null;
let _baseUrl = null;
let _model = null;
let _timeout = null;
function getConfig() {
    if (_apiKey === null) {
        _apiKey = process.env.DASHSCOPE_API_KEY ?? "";
        _baseUrl =
            process.env.AI_BASE_URL ??
                "https://dashscope.aliyuncs.com/compatible-mode/v1";
        _model = process.env.AI_MODEL ?? "qwen-plus";
        _timeout = parseInt(process.env.AI_TIMEOUT ?? "60000", 10);
        if (!_apiKey) {
            console.warn("[ai] WARNING: DASHSCOPE_API_KEY is not set — AI calls will fail!");
        }
        else {
            console.log(`[ai] Provider ready: model=${_model}, base=${_baseUrl}`);
        }
    }
    return {
        apiKey: _apiKey,
        baseUrl: _baseUrl,
        model: _model,
        timeout: _timeout,
    };
}
/**
 * Non-streaming AI call. Returns the full response.
 */
export async function chatCompletion(messages, opts) {
    const config = getConfig();
    const { apiKey, baseUrl, model } = config;
    const timeout = opts?.timeout ?? config.timeout;
    if (!apiKey) {
        throw new Error("DASHSCOPE_API_KEY is not configured");
    }
    const body = {
        model,
        messages,
        temperature: opts?.temperature ?? 0.7,
    };
    if (opts?.json) {
        body.response_format = { type: "json_object" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res;
    try {
        res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    }
    catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") {
            throw new Error(`AI API timeout after ${timeout}ms`);
        }
        throw new Error(`AI API network error: ${err.message}`);
    }
    clearTimeout(timer);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`AI API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
        console.warn("[ai] AI returned empty content", { usage: data.usage });
    }
    return { content, usage: data.usage };
}
/**
 * Streaming AI call. Yields text chunks.
 */
export async function* chatCompletionStream(messages, opts) {
    const { apiKey, baseUrl, model, timeout } = getConfig();
    if (!apiKey) {
        throw new Error("DASHSCOPE_API_KEY is not configured");
    }
    const body = {
        model,
        messages,
        temperature: opts?.temperature ?? 0.7,
        stream: true,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res;
    try {
        res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    }
    catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") {
            throw new Error(`AI API stream timeout after ${timeout}ms`);
        }
        throw new Error(`AI API network error: ${err.message}`);
    }
    clearTimeout(timer);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`AI API error ${res.status}: ${text}`);
    }
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error("No response body");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: "))
                continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]")
                return;
            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta)
                    yield delta;
            }
            catch {
                // skip invalid JSON
            }
        }
    }
}
//# sourceMappingURL=provider.js.map