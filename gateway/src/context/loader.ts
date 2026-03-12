/**
 * Async context loader with relevance-based filtering.
 *
 * Key design (borrowed from OpenClaw):
 * - Parallel loading of soul + memories via Promise.all
 * - Keyword-based relevance scoring (no vector DB needed)
 * - Mode-aware loading: process mode skips soul, chat loads more memories
 * - Returns pre-filtered, ranked context ready for prompt assembly
 */

import { loadMemory, type MemoryEntry } from "../memory/long-term.js";
import { loadSoul } from "../soul/manager.js";
import { loadProfile } from "../profile/manager.js";
import { goalRepo } from "../db/repositories/index.js";
import { extractKeywords } from "../lib/text-utils.js";
import type { ContextMode } from "./tiers.js";

/** Memory limits per mode */
const MEMORY_LIMITS: Record<ContextMode, number> = {
  process: 5,
  chat: 15,
  briefing: 10,
  estimate: 5,
};

export interface LoadedContext {
  soul?: string;
  /** User profile (factual info, separated from soul) */
  userProfile?: string;
  memories: string[];
  /** Raw memory entries (for downstream use like goal extraction) */
  rawMemories: MemoryEntry[];
  /** Active goals from goal table */
  goals: Array<{ id: string; title: string }>;
}

/**
 * Load warm-tier context in parallel, with relevance filtering.
 */
export async function loadWarmContext(opts: {
  deviceId: string;
  mode: ContextMode;
  inputText?: string;
  dateRange?: { start: string; end: string };
  /** Pre-loaded soul content (from localConfig) */
  localSoul?: string;
}): Promise<LoadedContext> {
  const needsSoul = opts.mode !== "process"; // process mode doesn't need soul
  const memoryLimit = MEMORY_LIMITS[opts.mode] ?? 10;

  // Parallel loading (soul + profile + memories + goals)
  const [soul, profile, rawMemories, activeGoals] = await Promise.all([
    needsSoul && !opts.localSoul
      ? loadSoulSafe(opts.deviceId)
      : Promise.resolve(undefined),
    loadProfileSafe(opts.deviceId),
    loadMemorySafe(opts.deviceId, opts.dateRange),
    loadGoalsSafe(opts.deviceId),
  ]);

  const soulContent = opts.localSoul ?? soul?.content;
  const profileContent = profile?.content;

  // Relevance-filter memories
  // When goal table has data, [目标] memories are demoted to normal processing
  const hasGoalTableData = activeGoals.length > 0;
  const ranked = rankMemories(rawMemories, opts.inputText, memoryLimit, hasGoalTableData);

  // Format as context strings
  const memories = ranked.map(
    (m) => `[${m.source_date ?? "未知日期"}] ${m.content}`,
  );

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
 * Uses keyword overlap + importance + recency.
 */
function rankMemories(
  memories: MemoryEntry[],
  inputText: string | undefined,
  limit: number,
  hasGoalTableData = false,
): MemoryEntry[] {
  if (memories.length === 0) return [];

  // When goal table has data, [目标] memories are treated as normal memories
  const goalMemories = hasGoalTableData
    ? []
    : memories.filter((m) => m.content.startsWith("[目标]"));
  const nonGoals = hasGoalTableData
    ? memories
    : memories.filter((m) => !m.content.startsWith("[目标]"));

  if (!inputText) {
    return [...goalMemories, ...nonGoals].slice(0, limit);
  }

  const inputKeywords = extractKeywords(inputText);

  // Score non-goal memories
  const scored = nonGoals.map((m) => ({
    memory: m,
    score: computeRelevanceScore(m, inputKeywords),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Goals always included + top-scored non-goals
  const goalSlots = Math.min(goalMemories.length, Math.ceil(limit * 0.4));
  const nonGoalSlots = limit - goalSlots;

  return [
    ...goalMemories.slice(0, goalSlots),
    ...scored.slice(0, nonGoalSlots).map((s) => s.memory),
  ];
}

/**
 * Compute relevance score for a memory entry.
 * Score range: 0.0 - 1.0
 */
function computeRelevanceScore(
  memory: MemoryEntry,
  inputKeywords: Set<string>,
): number {
  const memoryKeywords = extractKeywords(memory.content);

  // Keyword overlap (weight 0.4)
  let overlap = 0;
  for (const kw of memoryKeywords) {
    if (inputKeywords.has(kw)) overlap++;
  }
  const keywordScore = memoryKeywords.size > 0
    ? overlap / memoryKeywords.size
    : 0;

  // Importance (weight 0.3) — normalize 1-10 to 0-1
  const importanceScore = (memory.importance - 1) / 9;

  // Recency (weight 0.3) — decay over 30 days
  let recencyScore = 0.5; // default if no date
  if (memory.source_date) {
    const daysAgo = Math.max(
      0,
      (Date.now() - new Date(memory.source_date).getTime()) / 86400000,
    );
    recencyScore = 1 / (1 + daysAgo / 30);
  }

  return keywordScore * 0.4 + importanceScore * 0.3 + recencyScore * 0.3;
}

/** Safe profile loading (never throws) */
async function loadProfileSafe(deviceId: string) {
  try {
    return await loadProfile(deviceId);
  } catch (err: any) {
    console.warn(`[context-loader] Failed to load profile: ${err.message}`);
    return undefined;
  }
}

/** Safe soul loading (never throws) */
async function loadSoulSafe(deviceId: string) {
  try {
    return await loadSoul(deviceId);
  } catch (err: any) {
    console.warn(`[context-loader] Failed to load soul: ${err.message}`);
    return undefined;
  }
}

/** Safe memory loading (never throws) */
async function loadMemorySafe(
  deviceId: string,
  dateRange?: { start: string; end: string },
): Promise<MemoryEntry[]> {
  try {
    return await loadMemory(deviceId, dateRange);
  } catch (err: any) {
    console.warn(`[context-loader] Failed to load memories: ${err.message}`);
    return [];
  }
}

/** Safe goals loading (never throws) */
async function loadGoalsSafe(
  deviceId: string,
): Promise<Array<{ id: string; title: string }>> {
  try {
    return await goalRepo.findActiveByDevice(deviceId);
  } catch (err: any) {
    console.warn(`[context-loader] Failed to load goals: ${err.message}`);
    return [];
  }
}
