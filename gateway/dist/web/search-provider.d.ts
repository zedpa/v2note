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
export declare function createSearchProvider(): WebSearchProvider | null;
export declare function getSearchProvider(): WebSearchProvider | null;
