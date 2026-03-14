/**
 * Async context loader with relevance-based filtering.
 *
 * Key design (borrowed from OpenClaw):
 * - Parallel loading of soul + memories via Promise.all
 * - Keyword-based relevance scoring (no vector DB needed)
 * - Mode-aware loading: chat loads more memories than briefing
 * - Returns pre-filtered, ranked context ready for prompt assembly
 */
import { loadMemory } from "../memory/long-term.js";
import { loadSoul } from "../soul/manager.js";
import { loadProfile } from "../profile/manager.js";
import { goalRepo } from "../db/repositories/index.js";
import { extractKeywords } from "../lib/text-utils.js";
import { semanticSearch } from "../memory/embeddings.js";
/** Memory limits per mode */
const MEMORY_LIMITS = {
    chat: 15,
    briefing: 10,
};
/**
 * Load warm-tier context in parallel, with relevance filtering.
 */
export async function loadWarmContext(opts) {
    const memoryLimit = MEMORY_LIMITS[opts.mode] ?? 10;
    // Use userId for cross-device data when available, fall back to deviceId
    const id = opts.userId ?? opts.deviceId;
    const useUser = !!opts.userId;
    // Parallel loading (soul + profile + memories + goals)
    const [soul, profile, rawMemories, activeGoals] = await Promise.all([
        !opts.localSoul
            ? (useUser ? loadSoulByUserSafe(id) : loadSoulSafe(opts.deviceId))
            : Promise.resolve(undefined),
        useUser ? loadProfileByUserSafe(id) : loadProfileSafe(opts.deviceId),
        useUser ? loadMemoryByUserSafe(id, opts.dateRange) : loadMemorySafe(opts.deviceId, opts.dateRange),
        useUser ? loadGoalsByUserSafe(id) : loadGoalsSafe(opts.deviceId),
    ]);
    const soulContent = opts.localSoul ?? soul?.content;
    const profileContent = profile?.content;
    // Relevance-filter memories (embedding-first, keyword fallback)
    const ranked = await rankMemories(rawMemories, opts.inputText, memoryLimit);
    // Format as context strings
    const memories = ranked.map((m) => `[${m.source_date ?? "未知日期"}] ${m.content}`);
    const goals = activeGoals.map((g) => ({ id: g.id, title: g.title }));
    return {
        soul: soulContent,
        userProfile: profileContent,
        memories,
        rawMemories: ranked,
        goals,
    };
}
/**
 * Rank memories by relevance to input text.
 * Tries embedding-based search first, falls back to keyword scoring.
 */
async function rankMemories(memories, inputText, limit) {
    if (memories.length === 0)
        return [];
    if (!inputText) {
        // No input — return by importance + recency
        return memories.slice(0, limit);
    }
    // 1. Try embedding search
    try {
        const results = await semanticSearch(inputText, memories, limit);
        if (results.length > 0) {
            return results.map(r => {
                const entry = memories.find(m => m.content === r.content);
                return entry;
            }).filter(Boolean);
        }
    }
    catch {
        // fallback to keyword
    }
    // 2. Keyword fallback
    return keywordRank(memories, inputText, limit);
}
/**
 * Keyword-based memory ranking (fallback).
 */
function keywordRank(memories, inputText, limit) {
    const inputKeywords = extractKeywords(inputText);
    const scored = memories.map((m) => ({
        memory: m,
        score: computeRelevanceScore(m, inputKeywords),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.memory);
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
/** Safe profile loading (never throws) */
async function loadProfileSafe(deviceId) {
    try {
        return await loadProfile(deviceId);
    }
    catch (err) {
        console.warn(`[context-loader] Failed to load profile: ${err.message}`);
        return undefined;
    }
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
/** Safe goals loading (never throws) */
async function loadGoalsSafe(deviceId) {
    try {
        return await goalRepo.findActiveByDevice(deviceId);
    }
    catch (err) {
        console.warn(`[context-loader] Failed to load goals: ${err.message}`);
        return [];
    }
}
// ── User-based loaders (for cross-device unified data) ──
async function loadSoulByUserSafe(userId) {
    try {
        const { soulRepo } = await import("../db/repositories/index.js");
        return await soulRepo.findByUser(userId);
    }
    catch (err) {
        console.warn(`[context-loader] Failed to load soul by user: ${err.message}`);
        return undefined;
    }
}
async function loadProfileByUserSafe(userId) {
    try {
        const { userProfileRepo } = await import("../db/repositories/index.js");
        return await userProfileRepo.findByUser(userId);
    }
    catch (err) {
        console.warn(`[context-loader] Failed to load profile by user: ${err.message}`);
        return undefined;
    }
}
async function loadMemoryByUserSafe(userId, dateRange) {
    try {
        const memoryRepo = await import("../db/repositories/memory.js");
        return await memoryRepo.findByUser(userId, dateRange);
    }
    catch (err) {
        console.warn(`[context-loader] Failed to load memories by user: ${err.message}`);
        return [];
    }
}
async function loadGoalsByUserSafe(userId) {
    try {
        return await goalRepo.findActiveByUser(userId);
    }
    catch (err) {
        console.warn(`[context-loader] Failed to load goals by user: ${err.message}`);
        return [];
    }
}
//# sourceMappingURL=loader.js.map