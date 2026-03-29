/**
 * 搜索服务抽象层
 *
 * 根据环境变量选择 Tavily / SerpAPI / 无。
 */
/** 根据环境变量创建搜索服务。无 API key 时返回 null */
export function createSearchProvider() {
    if (process.env.TAVILY_API_KEY) {
        return new TavilyProvider(process.env.TAVILY_API_KEY);
    }
    if (process.env.SERPAPI_KEY) {
        return new SerpApiProvider(process.env.SERPAPI_KEY);
    }
    return null;
}
// 全局单例
let _provider;
export function getSearchProvider() {
    if (_provider === undefined) {
        _provider = createSearchProvider();
    }
    return _provider;
}
class TavilyProvider {
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async search(query, maxResults) {
        const resp = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: this.apiKey,
                query,
                max_results: maxResults,
                include_answer: true,
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok)
            throw new Error(`Tavily API error: ${resp.status}`);
        const data = await resp.json();
        return (data.results ?? []).map((r) => ({
            title: r.title ?? "",
            url: r.url ?? "",
            snippet: r.content ?? "",
            published_date: r.published_date,
        }));
    }
}
class SerpApiProvider {
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async search(query, maxResults) {
        const params = new URLSearchParams({
            q: query,
            api_key: this.apiKey,
            num: String(maxResults),
            engine: "google",
        });
        const resp = await fetch(`https://serpapi.com/search?${params}`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok)
            throw new Error(`SerpAPI error: ${resp.status}`);
        const data = await resp.json();
        return (data.organic_results ?? []).slice(0, maxResults).map((r) => ({
            title: r.title ?? "",
            url: r.link ?? "",
            snippet: r.snippet ?? "",
        }));
    }
}
//# sourceMappingURL=search-provider.js.map