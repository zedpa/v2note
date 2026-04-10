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
import { query as dbQuery } from "../db/pool.js";
import { getEmbedding } from "../memory/embeddings.js";
// ── matched_section 提取 ─────────────────────────────────
/**
 * 从 content 中提取包含关键字的段落（匹配行的前后各 2 行）
 */
export function extractMatchedSection(content, keyword) {
    const lines = content.split("\n");
    const keywordLower = keyword.toLowerCase();
    // 找到第一个匹配行的索引
    const matchIndex = lines.findIndex((line) => line.toLowerCase().includes(keywordLower));
    if (matchIndex === -1)
        return "";
    // 取匹配行前后各 2 行
    const start = Math.max(0, matchIndex - 2);
    const end = Math.min(lines.length, matchIndex + 3); // +3 因为 slice 不含 end
    return lines.slice(start, end).join("\n");
}
// ── Wiki 全文搜索 ────────────────────────────────────────
/**
 * Wiki page 全文搜索 — content 关键字匹配（ILIKE）
 */
export async function searchWikiByKeyword(keyword, userId, limit = 10) {
    const rows = await dbQuery(`SELECT id, title, content, summary
     FROM wiki_page
     WHERE user_id = $1 AND status = 'active'
       AND content ILIKE '%' || $2 || '%'
     LIMIT $3`, [userId, keyword, limit]);
    return rows.map((row) => ({
        page_id: row.id,
        title: row.title,
        matched_section: extractMatchedSection(row.content, keyword),
        summary: row.summary,
    }));
}
// ── Wiki 向量搜索 ────────────────────────────────────────
/**
 * Wiki page 向量搜索 — embedding 相似度
 * 如果 embedding 能力不可用，返回空数组
 */
export async function searchWikiByVector(queryText, userId, limit = 5) {
    try {
        const queryEmbedding = await getEmbedding(queryText);
        const embeddingStr = `[${queryEmbedding.join(",")}]`;
        const rows = await dbQuery(`SELECT id, title, content, summary,
              1 - (embedding <=> $1::vector) AS similarity
       FROM wiki_page
       WHERE user_id = $2 AND status = 'active'
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`, [embeddingStr, userId, limit]);
        return rows.map((row) => ({
            page_id: row.id,
            title: row.title,
            matched_section: row.content.split("\n").slice(0, 5).join("\n"), // 向量搜索取前 5 行作为段落
            summary: row.summary,
        }));
    }
    catch (err) {
        console.warn(`[wiki-search] vector search failed: ${err.message}`);
        return [];
    }
}
// ── Record 全文搜索 ──────────────────────────────────────
/**
 * Record 全文搜索 — transcript 关键字匹配
 */
export async function searchRecordsByKeyword(keyword, userId, limit = 10) {
    const rows = await dbQuery(`SELECT r.id, t.text, r.created_at
     FROM record r
     JOIN transcript t ON t.record_id = r.id
     WHERE r.user_id = $1 AND r.status = 'completed'
       AND t.text ILIKE '%' || $2 || '%'
     ORDER BY r.created_at DESC
     LIMIT $3`, [userId, keyword, limit]);
    return rows.map((row) => ({
        record_id: row.id,
        snippet: row.text.slice(0, 200), // 截取前 200 字符作为 snippet
        created_at: row.created_at,
    }));
}
// ── 统一搜索 ─────────────────────────────────────────────
/**
 * 统一搜索 — wiki + record 双层结构
 *
 * 步骤：
 * 1. 并行执行 wiki 全文搜索 + record 全文搜索
 * 2. 尝试 wiki 向量搜索并合并去重
 * 3. 返回双层结构
 */
export async function wikiUnifiedSearch(query, userId) {
    if (!query.trim()) {
        return { wiki_results: [], record_results: [] };
    }
    // 并行执行全文搜索 + 向量搜索
    const [wikiKeywordResults, recordResults, wikiVectorResults] = await Promise.all([
        searchWikiByKeyword(query, userId),
        searchRecordsByKeyword(query, userId),
        searchWikiByVector(query, userId),
    ]);
    // 合并 wiki 结果并去重（keyword 优先，vector 补充）
    const seenPageIds = new Set();
    const wikiResults = [];
    for (const r of wikiKeywordResults) {
        if (!seenPageIds.has(r.page_id)) {
            seenPageIds.add(r.page_id);
            wikiResults.push(r);
        }
    }
    for (const r of wikiVectorResults) {
        if (!seenPageIds.has(r.page_id)) {
            seenPageIds.add(r.page_id);
            wikiResults.push(r);
        }
    }
    console.log(`[wiki-search] unified: query="${query}", wiki=${wikiResults.length}, records=${recordResults.length}`);
    return {
        wiki_results: wikiResults,
        record_results: recordResults,
    };
}
// ── Chat 上下文加载 (场景 4.2) ───────────────────────────
/**
 * 加载与用户输入相关的 wiki page 上下文
 *
 * 用于 Chat 参谋：优先从 wiki page 检索高层认知上下文
 * 返回 "{title}: {summary}" 格式的字符串数组
 */
export async function loadWikiContext(userId, inputText, limit = 5) {
    if (!inputText?.trim()) {
        return [];
    }
    try {
        // 使用关键字从 wiki_page 中搜索
        const rows = await dbQuery(`SELECT id, title, content, summary
       FROM wiki_page
       WHERE user_id = $1 AND status = 'active'
         AND content ILIKE '%' || $2 || '%'
       LIMIT $3`, [userId, inputText.slice(0, 50), limit]);
        return rows.slice(0, limit).map((row) => {
            const summary = row.summary ?? row.content.slice(0, 100);
            return `${row.title}: ${summary}`;
        });
    }
    catch (err) {
        console.warn(`[wiki-search] loadWikiContext failed: ${err.message}`);
        return [];
    }
}
//# sourceMappingURL=wiki-search.js.map