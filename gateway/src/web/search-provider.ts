/**
 * 搜索服务抽象层
 *
 * 根据环境变量选择 Tavily / SerpAPI / 无。
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  published_date?: string;
}

export interface WebSearchProvider {
  search(query: string, maxResults: number): Promise<WebSearchResult[]>;
}

/** 根据环境变量创建搜索服务。无 API key 时返回 null */
export function createSearchProvider(): WebSearchProvider | null {
  if (process.env.MOONSHOT_API_KEY) {
    return new KimiProvider(process.env.MOONSHOT_API_KEY);
  }
  if (process.env.TAVILY_API_KEY) {
    return new TavilyProvider(process.env.TAVILY_API_KEY);
  }
  if (process.env.SERPAPI_KEY) {
    return new SerpApiProvider(process.env.SERPAPI_KEY);
  }
  return null;
}

// 全局单例
let _provider: WebSearchProvider | null | undefined;
export function getSearchProvider(): WebSearchProvider | null {
  if (_provider === undefined) {
    _provider = createSearchProvider();
  }
  return _provider;
}

class KimiProvider implements WebSearchProvider {
  constructor(private apiKey: string) {}

  async search(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const resp = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "kimi-latest",
        messages: [
          {
            role: "system",
            content: `你是一个搜索助手。用户会给你搜索关键词，请联网搜索后返回前 ${maxResults} 条结果。每条结果用 JSON 数组格式返回：[{"title":"...","url":"...","snippet":"..."}]。只返回 JSON，不要其他文字。`,
          },
          { role: "user", content: query },
        ],
        tools: [{ type: "builtin_function", function: { name: "$web_search" } }],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Kimi API error: ${resp.status} ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    // 从回复中提取 JSON 数组
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // 无法解析为结构化结果，返回整段文本作为单条结果
      return [{ title: "搜索结果", url: "", snippet: content.slice(0, 500) }];
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.slice(0, maxResults).map((r: any) => ({
        title: r.title ?? "",
        url: r.url ?? r.link ?? "",
        snippet: r.snippet ?? r.content ?? r.description ?? "",
      }));
    } catch {
      return [{ title: "搜索结果", url: "", snippet: content.slice(0, 500) }];
    }
  }
}

class TavilyProvider implements WebSearchProvider {
  constructor(private apiKey: string) {}

  async search(query: string, maxResults: number): Promise<WebSearchResult[]> {
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

    if (!resp.ok) throw new Error(`Tavily API error: ${resp.status}`);
    const data = await resp.json();
    return (data.results ?? []).map((r: any) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.content ?? "",
      published_date: r.published_date,
    }));
  }
}

class SerpApiProvider implements WebSearchProvider {
  constructor(private apiKey: string) {}

  async search(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      api_key: this.apiKey,
      num: String(maxResults),
      engine: "google",
    });

    const resp = await fetch(`https://serpapi.com/search?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) throw new Error(`SerpAPI error: ${resp.status}`);
    const data = await resp.json();
    return (data.organic_results ?? []).slice(0, maxResults).map((r: any) => ({
      title: r.title ?? "",
      url: r.link ?? "",
      snippet: r.snippet ?? "",
    }));
  }
}
