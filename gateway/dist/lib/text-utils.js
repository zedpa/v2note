/**
 * Shared text utility functions.
 * Extracted from context/loader.ts for reuse across gateway modules.
 */
/** Chinese stopwords to exclude from keyword matching */
export const STOPWORDS = new Set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有",
    "看", "好", "自己", "这", "他", "她", "它", "们", "那", "被", "从", "把",
    "还", "能", "对", "吗", "呢", "吧", "啊", "嗯", "哦", "额", "呃",
]);
/**
 * Extract keywords from Chinese/mixed text.
 * Uses character bigrams + word-level split for broad matching.
 */
export function extractKeywords(text) {
    const keywords = new Set();
    // Split on whitespace and common punctuation
    const words = text.split(/[\s,，。！？、；：""''（）()《》\[\]【】\-—…·]+/);
    for (const word of words) {
        const w = word.trim().toLowerCase();
        if (w.length >= 2 && !STOPWORDS.has(w)) {
            keywords.add(w);
        }
    }
    // Add character bigrams for Chinese text
    const cleaned = text.replace(/[a-zA-Z0-9\s\p{P}]/gu, "");
    for (let i = 0; i < cleaned.length - 1; i++) {
        const bigram = cleaned.slice(i, i + 2);
        keywords.add(bigram);
    }
    return keywords;
}
//# sourceMappingURL=text-utils.js.map