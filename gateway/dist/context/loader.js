/**
 * Async context loader with relevance-based filtering.
 *
 * Key design (borrowed from OpenClaw):
 * - Parallel loading of soul + memories via Promise.all
 * - Keyword-based relevance scoring (no vector DB needed)
 * - Mode-aware loading: process mode skips soul, chat loads more memories
 * - Returns pre-filtered, ranked context ready for prompt assembly
 */
import { loadMemory } from "../memory/long-term.js";
import { loadSoul } from "../soul/manager.js";
/** Chinese stopwords to exclude from keyword matching */
const STOPWORDS = new Set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有",
    "看", "好", "自己", "这", "他", "她", "它", "们", "那", "被", "从", "把",
    "还", "能", "对", "吗", "呢", "吧", "啊", "嗯", "哦", "额", "呃",
]);
/** Memory limits per mode */
const MEMORY_LIMITS = {
    process: 5,
    chat: 15,
    briefing: 10,
    estimate: 5,
};
/**
 * Load warm-tier context in parallel, with relevance filtering.
 */
export async function loadWarmContext(opts) {
    const needsSoul = opts.mode !== "process"; // process mode doesn't need soul
    const memoryLimit = MEMORY_LIMITS[opts.mode] ?? 10;
    // Parallel loading
    const [soul, rawMemories] = await Promise.all([
        needsSoul && !opts.localSoul
            ? loadSoulSafe(opts.deviceId)
            : Promise.resolve(undefined),
        loadMemorySafe(opts.deviceId, opts.dateRange),
    ]);
    const soulContent = opts.localSoul ?? soul?.content;
    // Relevance-filter memories
    const ranked = rankMemories(rawMemories, opts.inputText, memoryLimit);
    // Format as context strings
    const memories = ranked.map((m) => `[${m.source_date ?? "未知日期"}] ${m.content}`);
    return {
        soul: soulContent,
        memories,
        rawMemories: ranked,
    };
}
/**
 * Rank memories by relevance to input text.
 * Uses keyword overlap + importance + recency.
 */
function rankMemories(memories, inputText, limit) {
    if (memories.length === 0)
        return [];
    // Goals ([目标] prefixed) always surface — they're high-value context
    const goals = memories.filter((m) => m.content.startsWith("[目标]"));
    const nonGoals = memories.filter((m) => !m.content.startsWith("[目标]"));
    if (!inputText) {
        // No input text — fall back to importance-based selection
        // Goals first, then by importance
        return [...goals, ...nonGoals].slice(0, limit);
    }
    const inputKeywords = extractKeywords(inputText);
    // Score non-goal memories
    const scored = nonGoals.map((m) => ({
        memory: m,
        score: computeRelevanceScore(m, inputKeywords),
    }));
    scored.sort((a, b) => b.score - a.score);
    // Goals always included + top-scored non-goals
    const goalSlots = Math.min(goals.length, Math.ceil(limit * 0.4));
    const nonGoalSlots = limit - goalSlots;
    return [
        ...goals.slice(0, goalSlots),
        ...scored.slice(0, nonGoalSlots).map((s) => s.memory),
    ];
}
/**
 * Compute relevance score for a memory entry.
 * Score range: 0.0 - 1.0
 */
function computeRelevanceScore(memory, inputKeywords) {
    const memoryKeywords = extractKeywords(memory.content);
    // Keyword overlap (weight 0.4)
    let overlap = 0;
    for (const kw of memoryKeywords) {
        if (inputKeywords.has(kw))
            overlap++;
    }
    const keywordScore = memoryKeywords.size > 0
        ? overlap / memoryKeywords.size
        : 0;
    // Importance (weight 0.3) — normalize 1-10 to 0-1
    const importanceScore = (memory.importance - 1) / 9;
    // Recency (weight 0.3) — decay over 30 days
    let recencyScore = 0.5; // default if no date
    if (memory.source_date) {
        const daysAgo = Math.max(0, (Date.now() - new Date(memory.source_date).getTime()) / 86400000);
        recencyScore = 1 / (1 + daysAgo / 30);
    }
    return keywordScore * 0.4 + importanceScore * 0.3 + recencyScore * 0.3;
}
/**
 * Extract keywords from Chinese/mixed text.
 * Uses character bigrams + word-level split for broad matching.
 */
function extractKeywords(text) {
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
/** Safe soul loading (never throws) */
async function loadSoulSafe(deviceId) {
    try {
        return await loadSoul(deviceId);
    }
    catch (err) {
        console.warn(`[context-loader] Failed to load soul: ${err.message}`);
        return undefined;
    }
}
/** Safe memory loading (never throws) */
async function loadMemorySafe(deviceId, dateRange) {
    try {
        return await loadMemory(deviceId, dateRange);
    }
    catch (err) {
        console.warn(`[context-loader] Failed to load memories: ${err.message}`);
        return [];
    }
}
//# sourceMappingURL=loader.js.map