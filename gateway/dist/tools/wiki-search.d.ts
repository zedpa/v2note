/**
 * Wiki 搜索核心逻辑 — 双层搜索模型
 *
 * Layer 1: Wiki 层（AI 编译的知识）
 *   - 关键字全文搜索（content ILIKE）
 *   - 向量搜索（embedding 相似度）
 * Layer 2: Record 层（原始素材补充）
 *   - 全文搜索 transcript
 *
 * 场景 4.1: 统一搜索 API
 * 场景 4.2: Chat 参谋上下文加载
 */
export interface WikiSearchResult {
    page_id: string;
    title: string;
    matched_section: string;
    summary: string | null;
}
export interface RecordSearchResult {
    record_id: string;
    snippet: string;
    created_at: string;
}
export interface UnifiedSearchResult {
    wiki_results: WikiSearchResult[];
    record_results: RecordSearchResult[];
}
/**
 * 从 content 中提取包含关键字的段落（匹配行的前后各 2 行）
 */
export declare function extractMatchedSection(content: string, keyword: string): string;
/**
 * Wiki page 全文搜索 — content 关键字匹配（ILIKE）
 */
export declare function searchWikiByKeyword(keyword: string, userId: string, limit?: number): Promise<WikiSearchResult[]>;
/**
 * Wiki page 向量搜索 — embedding 相似度
 * 如果 embedding 能力不可用，返回空数组
 */
export declare function searchWikiByVector(queryText: string, userId: string, limit?: number): Promise<WikiSearchResult[]>;
/**
 * Record 全文搜索 — transcript 关键字匹配
 */
export declare function searchRecordsByKeyword(keyword: string, userId: string, limit?: number): Promise<RecordSearchResult[]>;
/**
 * 统一搜索 — wiki + record 双层结构
 *
 * 步骤：
 * 1. 并行执行 wiki 全文搜索 + record 全文搜索
 * 2. 尝试 wiki 向量搜索并合并去重
 * 3. 返回双层结构
 */
export declare function wikiUnifiedSearch(query: string, userId: string): Promise<UnifiedSearchResult>;
/**
 * 加载与用户输入相关的 wiki page 上下文
 *
 * 用于 Chat 参谋：优先从 wiki page 检索高层认知上下文
 * 返回 "{title}: {summary}" 格式的字符串数组
 */
export declare function loadWikiContext(userId: string, inputText: string | undefined, limit?: number): Promise<string[]>;
