/**
 * 统一搜索工具
 *
 * 合并 records/goals/todos/clusters 搜索为一个 search 工具，
 * LLM 只需选 scope 参数即可，降低工具选择压力。
 */

import { recordRepo, goalRepo, todoRepo, summaryRepo } from "../db/repositories/index.js";
import type { SearchParams, SearchResultItem } from "./types.js";

interface SearchContext {
  deviceId: string;
  userId?: string;
}

/**
 * 统一搜索 — 跨 records/goals/todos 搜索
 * clusters 搜索预留，待 cluster repository 完善后接入
 */
export async function unifiedSearch(
  params: SearchParams,
  ctx: SearchContext,
): Promise<SearchResultItem[]> {
  const { query, scope, limit = 10 } = params;
  const results: SearchResultItem[] = [];

  const scopes = scope === "all"
    ? ["records", "goals", "todos"] as const
    : [scope] as const;

  // 并行搜索所有目标 scope
  const promises: Promise<void>[] = [];

  if (scopes.includes("records")) {
    promises.push(searchRecords(query, ctx, results));
  }
  if (scopes.includes("goals")) {
    promises.push(searchGoals(query, ctx, results));
  }
  if (scopes.includes("todos")) {
    promises.push(searchTodos(query, ctx, results));
  }

  await Promise.all(promises);

  // 按相关性排序后截断
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/** 搜索日记/记录 — 通过 summary 补充标题和摘要 */
async function searchRecords(
  query: string,
  ctx: SearchContext,
  results: SearchResultItem[],
): Promise<void> {
  try {
    const records = ctx.userId
      ? await recordRepo.searchByUser(ctx.userId, query)
      : await recordRepo.search(ctx.deviceId, query);

    // 批量加载 summaries 以获取 title/short_summary
    const recordIds = records.map((r) => r.id);
    const summaries = recordIds.length > 0
      ? await summaryRepo.findByRecordIds(recordIds)
      : [];
    const summaryMap = new Map(summaries.map((s) => [s.record_id, s]));

    for (const r of records) {
      const summary = summaryMap.get(r.id);
      results.push({
        id: r.id,
        type: "record",
        title: summary?.title ?? `记录 ${r.id.slice(0, 8)}`,
        snippet: summary?.short_summary?.slice(0, 100),
        score: 1.0,
        created_at: r.created_at,
      });
    }
  } catch (err) {
    console.warn("[search] records search failed:", err);
  }
}

/** 搜索目标 — 客户端过滤匹配 */
async function searchGoals(
  query: string,
  ctx: SearchContext,
  results: SearchResultItem[],
): Promise<void> {
  try {
    const goals = ctx.userId
      ? await goalRepo.findActiveByUser(ctx.userId)
      : await goalRepo.findActiveByDevice(ctx.deviceId);

    const queryLower = query.toLowerCase();
    for (const g of goals) {
      if (g.title?.toLowerCase().includes(queryLower)) {
        results.push({
          id: g.id,
          type: "goal",
          title: g.title,
          score: 0.9,
          status: g.status,
          created_at: g.created_at,
        });
      }
    }
  } catch (err) {
    console.warn("[search] goals search failed:", err);
  }
}

/** 搜索待办 — 客户端过滤匹配 */
async function searchTodos(
  query: string,
  ctx: SearchContext,
  results: SearchResultItem[],
): Promise<void> {
  try {
    const todos = ctx.userId
      ? await todoRepo.findPendingByUser(ctx.userId)
      : await todoRepo.findPendingByDevice(ctx.deviceId);

    const queryLower = query.toLowerCase();
    for (const t of todos) {
      if (t.text?.toLowerCase().includes(queryLower)) {
        results.push({
          id: t.id,
          type: "todo",
          title: t.text,
          score: 0.8,
          status: t.done ? "completed" : "pending",
          created_at: t.created_at,
        });
      }
    }
  } catch (err) {
    console.warn("[search] todos search failed:", err);
  }
}
