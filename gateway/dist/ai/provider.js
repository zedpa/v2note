/**
 * AI provider — calls qwen-plus via OpenAI-compatible API.
 */
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY ?? "";
const AI_BASE_URL = process.env.AI_BASE_URL ??
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
const AI_MODEL = process.env.AI_MODEL ?? "qwen-plus";
/**
 * Non-streaming AI call. Returns the full response.
 */
export async function chatCompletion(messages, opts) {
    const body = {
        model: AI_MODEL,
        messages,
        temperature: opts?.temperature ?? 0.7,
    };
    if (opts?.json) {
        body.response_format = { type: "json_object" };
    }
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`AI API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    return {
        content: data.choices?.[0]?.message?.content ?? "",
        usage: data.usage,
    };
}
/**
 * Streaming AI call. Yields text chunks.
 */
export async function* chatCompletionStream(messages, opts) {
    const body = {
        model: AI_MODEL,
        messages,
        temperature: opts?.temperature ?? 0.7,
        stream: true,
    };
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify(body),
    });
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