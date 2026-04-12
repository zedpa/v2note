/**
 * 统一搜索工具
 *
 * 合并 records/goals/todos/clusters 搜索为一个 search 工具，
 * 支持 filters（status/date/date_from/date_to/goal_id/domain）结构化过滤。
 */

import { recordRepo, summaryRepo, memoryRepo, aiDiaryRepo } from "../db/repositories/index.js";
import { query as dbQuery } from "../db/pool.js";
import { today as tzToday, daysAgo, daysLater, toLocalDate, toLocalDateTime, dayRange } from "../lib/tz.js";
import type { SearchParams, SearchResultItem, SearchFilters } from "./types.js";

interface SearchContext {
  deviceId: string;
  userId?: string;
}

export async function unifiedSearch(
  params: SearchParams,
  ctx: SearchContext,
): Promise<SearchResultItem[]> {
  const { query, scope, limit = 10 } = params;

  // time_range 兼容：映射到 filters.date_from/date_to
  const filters: SearchFilters = { ...params.filters };
  if (params.time_range && !filters.date_from && !filters.date_to) {
    filters.date_from = params.time_range.from;
    filters.date_to = params.time_range.to;
  }

  // 空 query + 无日期过滤 = 无意义搜索，提前返回错误提示
  const hasDateFilter = !!(filters.date || filters.date_from || filters.date_to);
  if (!query && !hasDateFilter && scope !== "memories") {
    return []; // 调用方会处理空结果提示
  }

  const results: SearchResultItem[] = [];
  const scopes = scope === "all"
    ? ["records", "goals", "todos"] as const
    : [scope] as const;

  const promises: Promise<void>[] = [];
  if (scopes.includes("records"))  promises.push(searchRecords(query, filters, ctx, results));
  if (scopes.includes("goals"))    promises.push(searchGoals(query, filters, ctx, results));
  if (scopes.includes("todos"))    promises.push(searchTodos(query, filters, ctx, results));
  if ((scopes as readonly string[]).includes("memories")) promises.push(searchMemories(query, ctx, results));

  // AI 日报：仅在 records scope + 有日期过滤 + include_ai_diary 时附加
  if (filters.include_ai_diary && (scopes.includes("records") || scope === "all") && hasDateFilter) {
    promises.push(searchAiDiary(filters, ctx, results));
  }

  await Promise.all(promises);

  // 空 query 按时间排序（浏览模式），有 query 按相关性排序
  if (!query) {
    results.sort((a, b) => {
      const ta = String(a.created_at ?? "");
      const tb = String(b.created_at ?? "");
      return tb.localeCompare(ta);
    });
  } else {
    results.sort((a, b) => b.score - a.score);
  }
  const final = results.slice(0, limit);
  console.log(`[search] unifiedSearch: query="${query}", scope="${scope}", filters=${JSON.stringify(filters)}, total=${final.length} results`);
  if (final.length > 0) console.log(`[search]   first result: ${JSON.stringify(final[0]).slice(0, 200)}`);
  return final;
}

// ── 日期解析 ────────────────────────────────────────────────────────────────

function resolveDate(dateStr: string): string | null {
  let result: string | null = null;
  if (dateStr === "today") result = tzToday();
  else if (dateStr === "tomorrow") result = daysLater(1);
  else if (dateStr === "yesterday") result = daysAgo(1);
  else if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) result = dateStr.split("T")[0];
  console.log(`[search] resolveDate("${dateStr}") → ${result}`);
  return result;
}

// ── 日记搜索 ────────────────────────────────────────────────────────────────

async function searchRecords(
  query: string,
  filters: SearchFilters,
  ctx: SearchContext,
  results: SearchResultItem[],
): Promise<void> {
  try {
    // 解析日期过滤
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    if (filters.date) {
      const d = resolveDate(filters.date);
      if (d) { dateFrom = d; dateTo = d; }
    } else {
      dateFrom = filters.date_from ? resolveDate(filters.date_from) : null;
      dateTo = filters.date_to ? resolveDate(filters.date_to) : null;
    }

    let records: Awaited<ReturnType<typeof recordRepo.searchByUser>>;

    if (!query && ctx.userId && (dateFrom || dateTo)) {
      // 空 query 快速路径：直接按日期查，跳过 ILIKE join
      const range = dayRange(dateFrom ?? dateTo!);
      const start = dateFrom ? range.start : "1970-01-01T00:00:00Z";
      const end = dateTo ? (dateFrom === dateTo ? range.end : dayRange(dateTo).end) : "2099-12-31T23:59:59Z";
      console.log(`[search] searchRecords: dateFrom=${dateFrom}, dateTo=${dateTo}, range=${start} ~ ${end}`);
      records = await recordRepo.findByUserAndDateRange(ctx.userId, start, end);
      console.log(`[search] searchRecords: found ${records.length} records`);
      // findByUserAndDateRange 返回 ASC 排序，反转为 DESC（最新在前），再截断 100 条
      records = records.reverse().slice(0, 100);
    } else if (query) {
      records = ctx.userId
        ? await recordRepo.searchByUser(ctx.userId, query)
        : await recordRepo.search(ctx.deviceId, query);
    } else {
      return; // 空 query 且无日期过滤，不搜索 records
    }

    const recordIds = records.map((r) => r.id);
    const summaries = recordIds.length > 0
      ? await summaryRepo.findByRecordIds(recordIds)
      : [];
    const summaryMap = new Map(summaries.map((s) => [s.record_id, s]));

    for (const r of records) {
      // 有 query 时按日期二次过滤（快速路径已在 SQL 中过滤）
      if (query && (dateFrom || dateTo)) {
        const createdDate = toLocalDate(r.created_at);
        if (dateFrom && createdDate && createdDate < dateFrom) continue;
        if (dateTo && createdDate && createdDate > dateTo) continue;
      }

      // domain 过滤（兼容旧数据，record.domain 列仍存在但不再写入）
      if (filters.domain && r.domain !== filters.domain) continue;

      const summary = summaryMap.get(r.id);
      results.push({
        id: r.id,
        type: "record",
        title: summary?.title ?? `记录 ${r.id.slice(0, 8)}`,
        snippet: summary?.short_summary?.slice(0, 100),
        score: query ? 1.0 : 0.5,
        created_at: toLocalDateTime(r.created_at),
      });
    }
  } catch (err) {
    console.warn("[search] records search failed:", err);
  }
}

// ── 目标搜索 ────────────────────────────────────────────────────────────────

async function searchGoals(
  query: string,
  filters: SearchFilters,
  ctx: SearchContext,
  results: SearchResultItem[],
): Promise<void> {
  try {
    const statusFilter = filters.status ?? "active";
    const userId = ctx.userId ?? ctx.deviceId;

    // 根据 status 决定查询范围
    let rows: Array<{ id: string; title: string; status: string; created_at: string }>;

    if (statusFilter === "all") {
      rows = await dbQuery<{ id: string; title: string; status: string; created_at: string }>(
        `SELECT id, text AS title, status, created_at FROM todo
         WHERE user_id = $1 AND level >= 1
         ORDER BY created_at DESC`,
        [userId],
      );
    } else if (statusFilter === "completed") {
      rows = await dbQuery<{ id: string; title: string; status: string; created_at: string }>(
        `SELECT id, text AS title, status, created_at FROM todo
         WHERE user_id = $1 AND level >= 1 AND status = 'completed'
         ORDER BY created_at DESC`,
        [userId],
      );
    } else {
      // active（默认）
      rows = await dbQuery<{ id: string; title: string; status: string; created_at: string }>(
        `SELECT id, text AS title, status, created_at FROM todo
         WHERE user_id = $1 AND level >= 1 AND status != 'completed' AND done = false
         ORDER BY created_at DESC`,
        [userId],
      );
    }

    const queryLower = query.toLowerCase();
    for (const g of rows) {
      if (g.title?.toLowerCase().includes(queryLower)) {
        results.push({
          id: g.id,
          type: "goal",
          title: g.title,
          score: 0.9,
          status: g.status,
          created_at: toLocalDateTime(g.created_at),
        });
      }
    }
  } catch (err) {
    console.warn("[search] goals search failed:", err);
  }
}

// ── 待办搜索 ────────────────────────────────────────────────────────────────

async function searchTodos(
  query: string,
  filters: SearchFilters,
  ctx: SearchContext,
  results: SearchResultItem[],
): Promise<void> {
  try {
    const statusFilter = filters.status ?? "active";
    const userId = ctx.userId ?? ctx.deviceId;

    // 动态构建 WHERE 子句
    const conditions: string[] = ["(t.user_id = $1 OR t.device_id = $1)", "t.level = 0"];
    const params: any[] = [userId];
    let paramIdx = 2;

    // status 过滤
    if (statusFilter === "active") {
      conditions.push("t.done = false");
    } else if (statusFilter === "completed") {
      conditions.push("t.done = true");
    }
    // "all" 不加 done 过滤

    // goal_id 过滤（parent_id）
    if (filters.goal_id) {
      conditions.push(`t.parent_id = $${paramIdx++}`);
      params.push(filters.goal_id);
    }

    // domain 过滤
    if (filters.domain) {
      conditions.push(`t.domain = $${paramIdx++}`);
      params.push(filters.domain);
    }

    // date 快捷键（今天/明天/昨天）解析为 date_from + date_to 精确匹配
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    if (filters.date) {
      const d = resolveDate(filters.date);
      if (d) { dateFrom = d; dateTo = d; }
    } else {
      dateFrom = filters.date_from ? resolveDate(filters.date_from) : null;
      dateTo = filters.date_to ? resolveDate(filters.date_to) : null;
    }

    // 有日期过滤时，只查有 scheduled_start 的待办
    if (dateFrom || dateTo) {
      conditions.push("t.scheduled_start IS NOT NULL");
      if (dateFrom) {
        conditions.push(`DATE(t.scheduled_start) >= $${paramIdx++}`);
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push(`DATE(t.scheduled_start) <= $${paramIdx++}`);
        params.push(dateTo);
      }
    }

    const sql = `SELECT t.id, t.text, t.done, t.scheduled_start, t.domain, t.parent_id, t.created_at
                 FROM todo t
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY t.created_at DESC
                 LIMIT 100`;

    const todos = await dbQuery<{
      id: string;
      text: string;
      done: boolean;
      scheduled_start?: string;
      domain?: string;
      parent_id?: string;
      created_at: string;
    }>(sql, params);

    const queryLower = query.toLowerCase();
    for (const t of todos) {
      if (!t.text?.toLowerCase().includes(queryLower)) continue;
      results.push({
        id: t.id,
        type: "todo",
        title: t.text,
        score: 0.8,
        status: t.done ? "completed" : "pending",
        created_at: toLocalDateTime(t.created_at),
      });
    }
  } catch (err) {
    console.warn("[search] todos search failed:", err);
  }
}

// ── 记忆搜索 ────────────────────────────────────────────────────────────────

async function searchMemories(
  query: string,
  ctx: SearchContext,
  results: SearchResultItem[],
): Promise<void> {
  try {
    if (!ctx.userId) return;
    const memories = await memoryRepo.findByUser(ctx.userId, undefined, 100);

    const queryLower = query.toLowerCase();
    for (const m of memories) {
      if (query && !m.content.toLowerCase().includes(queryLower)) continue;
      results.push({
        id: m.id,
        type: "memory",
        title: m.content.slice(0, 60) + (m.content.length > 60 ? "…" : ""),
        snippet: m.content.slice(0, 100),
        score: query ? 0.7 : (m.importance / 10),
        created_at: toLocalDateTime(m.created_at),
      });
    }
  } catch (err) {
    console.warn("[search] memories search failed:", err);
  }
}

// ── AI 日报搜索 ──────────────────────────────────────────────────────────────

async function searchAiDiary(
  filters: SearchFilters,
  ctx: SearchContext,
  results: SearchResultItem[],
): Promise<void> {
  try {
    if (!ctx.userId) return;

    // 解析日期范围
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    if (filters.date) {
      const d = resolveDate(filters.date);
      if (d) { dateFrom = d; dateTo = d; }
    } else {
      dateFrom = filters.date_from ? resolveDate(filters.date_from) : null;
      dateTo = filters.date_to ? resolveDate(filters.date_to) : null;
    }
    if (!dateFrom || !dateTo) return;

    const diaries = await aiDiaryRepo.findSummariesByUser(
      ctx.userId, "chat-daily", dateFrom, dateTo,
    );

    for (const d of diaries) {
      results.push({
        id: d.id,
        type: "ai_diary",
        title: `AI 日报 ${d.entry_date}`,
        snippet: d.summary?.slice(0, 100),
        score: 0.6,
        created_at: d.entry_date,
      });
    }
  } catch (err) {
    console.warn("[search] ai_diary search failed:", err);
  }
}
