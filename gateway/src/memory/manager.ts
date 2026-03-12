import { ShortTermMemory } from "./short-term.js";
import { loadMemory, saveMemory, type MemoryEntry } from "./long-term.js";
import { chatCompletion } from "../ai/provider.js";
import { loadWarmContext } from "../context/loader.js";
import { semanticSearch, findSimilarMemory } from "./embeddings.js";
import * as memoryRepo from "../db/repositories/memory.js";
import type { ContextMode } from "../context/tiers.js";

/**
 * MemoryManager combines short-term (session) and long-term (Supabase) memory.
 *
 * Enhanced with Mem0-inspired features:
 * - Semantic search via embeddings (optional, falls back to keyword-based)
 * - Automatic memory deduplication (prevents storing near-identical memories)
 * - Memory consolidation (merges related memories over time)
 */
export class MemoryManager {
  private shortTerm = new ShortTermMemory();

  /**
   * Load relevant memories for a session.
   * @deprecated Use loadRelevantContext() for new code — it supports relevance filtering.
   */
  async loadContext(
    deviceId: string,
    dateRange?: { start: string; end: string },
  ): Promise<string[]> {
    const longTerm = await loadMemory(deviceId, dateRange);
    const shortTermEntries = this.shortTerm.getAll();

    const memories: string[] = [];

    // Add short-term context
    if (shortTermEntries.length > 0) {
      memories.push(`[近期对话] ${this.shortTerm.getSummary()}`);
    }

    // Add long-term memories
    for (const entry of longTerm) {
      memories.push(`[${entry.source_date ?? "未知日期"}] ${entry.content}`);
    }

    return memories;
  }

  /**
   * Load relevance-filtered memories using the context loader.
   * Returns both formatted strings and raw entries.
   */
  async loadRelevantContext(
    deviceId: string,
    opts?: {
      mode?: ContextMode;
      inputText?: string;
      dateRange?: { start: string; end: string };
      localSoul?: string;
    },
  ): Promise<{
    soul?: string;
    userProfile?: string;
    memories: string[];
    rawMemories: MemoryEntry[];
  }> {
    const shortTermEntries = this.shortTerm.getAll();

    const loaded = await loadWarmContext({
      deviceId,
      mode: opts?.mode ?? "chat",
      inputText: opts?.inputText,
      dateRange: opts?.dateRange,
      localSoul: opts?.localSoul,
    });

    // Prepend short-term context if available
    if (shortTermEntries.length > 0) {
      loaded.memories.unshift(`[近期对话] ${this.shortTerm.getSummary()}`);
    }

    return loaded;
  }

  /**
   * Semantic memory search (Mem0-style).
   * Falls back to keyword-based loading if embeddings unavailable.
   */
  async searchMemories(
    deviceId: string,
    query: string,
    limit: number = 10,
  ): Promise<Array<{ content: string; score: number; source_date: string | null }>> {
    const allMemories = await loadMemory(deviceId);

    try {
      const results = await semanticSearch(query, allMemories, limit);
      console.log(`[memory] Semantic search returned ${results.length} results`);
      return results;
    } catch (err: any) {
      console.warn(`[memory] Semantic search failed, using keyword fallback: ${err.message}`);
      // Fallback: return by importance
      return allMemories.slice(0, limit).map((m) => ({
        content: m.content,
        score: m.importance / 10,
        source_date: m.source_date,
      }));
    }
  }

  /**
   * Add to short-term memory.
   */
  addShortTerm(content: string) {
    this.shortTerm.add(content);
  }

  /**
   * After processing a record, use AI to decide if a long-term memory should be created.
   * Enhanced with Mem0-style deduplication: checks for similar existing memories
   * and updates instead of creating duplicates.
   */
  async maybeCreateMemory(
    deviceId: string,
    content: string,
    date: string,
  ): Promise<void> {
    const result = await chatCompletion(
      [
        {
          role: "system",
          content: `判断以下内容是否值得作为长期记忆保存。只保存重要的事实、决定、承诺或关键事件。

特别注意：当用户表达目标、计划、愿望或野心时（如"我要完成融资"、"今年想跑马拉松"、"这个季度重点是..."），
必须保存为高重要性记忆，summary 以 [目标] 开头，importance 设为 8-10。

返回 JSON: {"save": true/false, "summary": "简洁摘要", "importance": 1-10}
如果不值得保存，返回 {"save": false}`,
        },
        { role: "user", content },
      ],
      { json: true, temperature: 0.3 },
    );

    try {
      const parsed = JSON.parse(result.content);
      if (parsed.save && parsed.summary) {
        // Mem0-style dedup: check for similar existing memories
        await this.saveWithDedup(deviceId, parsed.summary, date, parsed.importance ?? 5);
      }
    } catch {
      // Skip if AI response can't be parsed
    }
  }

  /**
   * Save memory with semantic deduplication (Mem0-inspired).
   * If a very similar memory exists, update it instead of creating a duplicate.
   */
  private async saveWithDedup(
    deviceId: string,
    content: string,
    date: string,
    importance: number,
  ): Promise<void> {
    try {
      const existing = await loadMemory(deviceId);
      const similar = await findSimilarMemory(content, existing, 0.85);

      if (similar) {
        // Update existing memory: merge content, take higher importance
        const mergedImportance = Math.max(similar.importance, importance);
        const shouldUpdateContent = content.length > similar.content.length;

        await memoryRepo.update(similar.id, deviceId, {
          content: shouldUpdateContent ? content : similar.content,
          importance: mergedImportance,
        });
        console.log(`[memory] Dedup: updated existing memory ${similar.id} (similarity: ${similar.score.toFixed(2)})`);
        return;
      }
    } catch (err: any) {
      // Embedding unavailable — skip dedup, just save
      console.warn(`[memory] Dedup check skipped: ${err.message}`);
    }

    // No similar memory found — create new
    await saveMemory(deviceId, content, date, importance);
  }

  clearShortTerm() {
    this.shortTerm.clear();
  }
}
