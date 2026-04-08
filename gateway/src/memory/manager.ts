import { ShortTermMemory } from "./short-term.js";
import { loadMemory, saveMemory, type MemoryEntry } from "./long-term.js";
import { chatCompletion } from "../ai/provider.js";
import { loadWarmContext } from "../context/loader.js";
import { semanticSearch, findSimilarMemory } from "./embeddings.js";
import * as memoryRepo from "../db/repositories/memory.js";
import type { ContextMode } from "../context/tiers.js";
import { formatDateWithRelative } from "../lib/date-anchor.js";

/**
 * MemoryManager combines short-term (session) and long-term (Supabase) memory.
 *
 * Mem0-inspired two-stage approach:
 * 1. Extract candidate facts from content
 * 2. For each candidate, retrieve similar memories and decide: ADD/UPDATE/DELETE/NONE
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
    userId?: string,
  ): Promise<string[]> {
    const longTerm = await loadMemory(deviceId, dateRange, userId);
    const shortTermEntries = this.shortTerm.getAll();

    const memories: string[] = [];

    if (shortTermEntries.length > 0) {
      memories.push(`[近期对话] ${this.shortTerm.getSummary()}`);
    }

    for (const entry of longTerm) {
      const label = entry.source_date
        ? formatDateWithRelative(new Date(entry.source_date))
        : "日期未知";
      memories.push(`[${label}] ${entry.content}`);
    }

    return memories;
  }

  /**
   * Load relevance-filtered memories using the context loader.
   */
  async loadRelevantContext(
    deviceId: string,
    opts?: {
      mode?: ContextMode;
      inputText?: string;
      dateRange?: { start: string; end: string };
      localSoul?: string;
      userId?: string;
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
      userId: opts?.userId,
      mode: opts?.mode ?? "chat",
      inputText: opts?.inputText,
      dateRange: opts?.dateRange,
      localSoul: opts?.localSoul,
    });

    if (shortTermEntries.length > 0) {
      loaded.memories.unshift(`[近期对话] ${this.shortTerm.getSummary()}`);
    }

    return loaded;
  }

  /**
   * Semantic memory search.
   * Falls back to keyword-based loading if embeddings unavailable.
   */
  async searchMemories(
    deviceId: string,
    query: string,
    limit: number = 10,
    userId?: string,
  ): Promise<Array<{ content: string; score: number; source_date: string | null }>> {
    const allMemories = await loadMemory(deviceId, undefined, userId);

    try {
      const results = await semanticSearch(query, allMemories, limit);
      console.log(`[memory] Semantic search returned ${results.length} results`);
      return results;
    } catch (err: any) {
      console.warn(`[memory] Semantic search failed, using keyword fallback: ${err.message}`);
      return allMemories.slice(0, limit).map((m) => ({
        content: m.content,
        score: m.importance / 10,
        source_date: m.source_date,
      }));
    }
  }

  addShortTerm(content: string) {
    this.shortTerm.add(content);
  }

  /** 每用户记忆上限。超出时自动淘汰最低重要性的记忆。 */
  static readonly MAX_MEMORIES_PER_USER = 500;

  /**
   * Mem0 two-stage memory management:
   * 1. AI extracts candidate facts from content
   * 2. For each candidate, embedding-retrieve top-5 similar memories
   * 3. AI decides in one call: ADD / UPDATE(id) / DELETE(id) / NONE
   * 4. Execute decisions（含上限淘汰）
   */
  async maybeCreateMemory(
    deviceId: string,
    content: string,
    date: string,
    userId?: string,
  ): Promise<void> {
    // Load all existing memories for comparison
    const existingMemories = await loadMemory(deviceId, undefined, userId);

    // Find top-5 similar memories for context
    let similarContext = "";
    try {
      const similar = await semanticSearch(content, existingMemories, 5);
      if (similar.length > 0) {
        similarContext = similar
          .map((s) => `- [id: ${(s as any).id ?? "?"}] ${s.content} (importance: ${(s as any).importance ?? 5}, date: ${s.source_date ?? "?"})`)
          .join("\n");
      }
    } catch {
      // Embedding unavailable — provide recent memories as fallback
      if (existingMemories.length > 0) {
        similarContext = existingMemories
          .slice(0, 5)
          .map((m) => `- [id: ${m.id}] ${m.content} (importance: ${m.importance}, date: ${m.source_date ?? "?"})`)
          .join("\n");
      }
    }

    // Single AI call: extract + compare + decide
    const result = await chatCompletion(
      [
        {
          role: "system",
          content: `你是记忆管理系统。分析用户的新内容，提取值得长期保存的事实、决定、承诺或关键事件。

## 现有相关记忆
${similarContext || "（暂无记忆）"}

## 决策规则
对每条值得保存的信息，与现有记忆比较后决定：
- **ADD**: 全新信息，不与任何现有记忆重复 → 创建新记忆
- **UPDATE**: 是对某条现有记忆的更新/修正/补充 → 更新该记忆（提供 id）
- **DELETE**: 新内容明确否定了某条现有记忆 → 删除该记忆（提供 id）
- **NONE**: 内容不值得保存（日常流水账、无信息增量）

## 重要性评分
- 1-3: 一般事实
- 4-6: 较重要的信息（习惯、偏好、日常决定）
- 7-8: 重要事件（职业变动、重要决定、关键关系）
- 9-10: 核心目标/重大人生事件

返回 JSON 数组：
[
  {"action": "ADD", "content": "简洁摘要", "importance": 7},
  {"action": "UPDATE", "id": "mem-xxx", "content": "更新后的摘要", "importance": 8},
  {"action": "DELETE", "id": "mem-yyy", "reason": "已过时"},
  {"action": "NONE"}
]

如果没有任何值得保存的信息，返回 [{"action": "NONE"}]。`,
        },
        { role: "user", content },
      ],
      { json: true, temperature: 0.3, tier: "background" },
    );

    try {
      const decisions = JSON.parse(result.content);
      if (!Array.isArray(decisions)) return;

      for (const decision of decisions) {
        switch (decision.action) {
          case "ADD":
            if (decision.content) {
              // 上限淘汰：超过 MAX 时删除最低重要性的记忆
              if (userId) {
                const count = await memoryRepo.countByUser(userId);
                if (count >= MemoryManager.MAX_MEMORIES_PER_USER) {
                  const evictCount = count - MemoryManager.MAX_MEMORIES_PER_USER + 1;
                  await memoryRepo.evictLeastImportant(userId, evictCount);
                  console.log(`[memory] Evicted ${evictCount} low-importance memories (total was ${count})`);
                }
              }
              await saveMemory(deviceId, decision.content, date, decision.importance ?? 5, userId);
              console.log(`[memory] ADD: "${decision.content.slice(0, 50)}..." (importance: ${decision.importance ?? 5})`);
            }
            break;
          case "UPDATE":
            if (decision.id && decision.content) {
              if (userId) {
                await memoryRepo.updateByUser(decision.id, userId, {
                  content: decision.content,
                  importance: decision.importance,
                });
              } else {
                await memoryRepo.update(decision.id, deviceId, {
                  content: decision.content,
                  importance: decision.importance,
                });
              }
              console.log(`[memory] UPDATE ${decision.id}: "${decision.content.slice(0, 50)}..."`);
            }
            break;
          case "DELETE":
            if (decision.id) {
              if (userId) {
                await memoryRepo.deleteByIdAndUser(decision.id, userId);
              } else {
                await memoryRepo.deleteById(decision.id, deviceId);
              }
              console.log(`[memory] DELETE ${decision.id}: ${decision.reason ?? "outdated"}`);
            }
            break;
          case "NONE":
            break;
        }
      }
    } catch {
      // Skip if AI response can't be parsed
    }
  }

  clearShortTerm() {
    this.shortTerm.clear();
  }
}
