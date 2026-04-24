/**
 * Wiki 编译引擎主入口 — 每日/手动触发的知识编译
 *
 * 三阶段流程：
 *   A. 路由（轻量，不调 AI）— wiki_page_record 关联 + page 树检索
 *   B. 编译（1 次 AI 调用）— 生成编译指令
 *   C. 执行指令（单个 DB 事务）— 原子写入
 */

import { getPool } from "../db/pool.js";
import * as recordRepo from "../db/repositories/record.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../db/repositories/wiki-page-record.js";
import * as wikiPageLinkRepo from "../db/repositories/wiki-page-link.js";
import * as todoRepo from "../db/repositories/todo.js";
import * as wikiPageEventRepo from "../db/repositories/wiki-page-event.js";
import * as goalRepo from "../db/repositories/goal.js";
import { chatCompletion } from "../ai/provider.js";
import { buildCompilePrompt } from "./wiki-compile-prompt.js";
import { findPagesByRecords } from "../db/repositories/wiki-page-record.js";
import { canAiModifyStructure, createSuggestion } from "./page-authorization.js";
import { now as tzNow } from "../lib/tz.js";
import { execute } from "../db/pool.js";

// ── 类型定义 ──

export interface CompileResult {
  pages_created: number;
  pages_updated: number;
  pages_split: number;
  pages_merged: number;
  records_compiled: number;
  summary?: string;
}

/** AI 返回的编译指令 */
export interface CompileInstructions {
  update_pages: Array<{
    page_id: string;
    new_content: string;
    new_summary: string;
    add_record_ids: string[];
  }>;
  create_pages: Array<{
    title: string;
    content: string;
    summary: string;
    parent_id: string | null;
    level: number;
    record_ids: string[];
  }>;
  merge_pages: Array<{
    source_id: string;
    target_id: string;
    reason: string;
  }>;
  split_page: Array<{
    source_id: string;
    new_parent_content: string;
    children: Array<{
      title: string;
      content: string;
      summary: string;
    }>;
  }>;
  goal_sync: Array<{
    action: "create" | "update";
    goal_id?: string;
    title?: string;
    status?: string;
    wiki_page_id?: string;
    parent_page_id?: string;
    progress?: number;
  }>;
  links?: Array<{
    source_page_id: string;
    target_page_id: string;
    link_type: "reference" | "related" | "contradicts";
    context_text: string;
  }>;
}

/** Record 加载后的文本信息 */
interface RecordWithText {
  id: string;
  text: string;
  source_type: string;
  created_at: string;
}

/** Page 的索引信息（不含 content） */
interface PageIndex {
  id: string;
  title: string;
  summary: string | null;
  level: number;
  page_type: "topic" | "goal";
}

/** 命中的 page（含完整 content） */
interface MatchedPage {
  id: string;
  title: string;
  content: string;
  summary: string;
  level: number;
}

// ── 内存级并发锁（替代 advisory lock，避免 pooler 长连接超时） ──
const compileLocks = new Set<string>();

// ── token 预算常量 ──

/** 命中 page content 总量上限（字符数），1 token ≈ 1.5 中文字符 → 30000 tokens ≈ 45000 字符 */
const MAX_CONTENT_CHARS = 45000;


/** AI 调用超时（5分钟） */
const AI_TIMEOUT_MS = 5 * 60 * 1000;

// ── 主入口 ──

/**
 * 对指定用户执行 wiki 编译
 *
 * @param userId - 用户 ID
 * @param maxRecords - 最大处理 record 数（默认 30，重试时缩减）
 * @returns 编译结果
 */
export async function compileWikiForUser(
  userId: string,
  maxRecords = 30,
): Promise<CompileResult> {
  const emptyResult: CompileResult = {
    pages_created: 0,
    pages_updated: 0,
    pages_split: 0,
    pages_merged: 0,
    records_compiled: 0,
  };

  /** 锚点计时器 */
  const T = (label: string) => {
    const t0 = Date.now();
    return (extra = "") => console.log(`[wiki-compiler][⏱ ${label}] ${Date.now() - t0}ms${extra ? " — " + extra : ""}`);
  };

  // ── 并发锁（内存级，避免长事务连接被 pooler 断开）──
  const lockKey = `compile_${userId}`;
  if (compileLocks.has(lockKey)) {
    console.log(`[wiki-compiler] 用户 ${userId} 编译已在进行中（内存锁），跳过`);
    return emptyResult;
  }
  compileLocks.add(lockKey);

  try {
    const tLock = T("lock");
    tLock("acquired (in-memory)");

    // ── 循环处理所有待编译 record（每轮最多 maxRecords 条）──
    const MAX_BATCH_ITERATIONS = 5;
    const tTotal = T("total");

    for (let batch = 0; batch < MAX_BATCH_ITERATIONS; batch++) {
      const tBatch = T(`batch-${batch + 1}`);
      console.log(`[wiki-compiler] ── 第 ${batch + 1}/${MAX_BATCH_ITERATIONS} 轮开始 ──`);

      // ── 阶段 A: 路由 ──
      const tQuery = T(`batch-${batch + 1}/query`);
      let pendingRecords = await recordRepo.findPendingCompile(userId, maxRecords);
      tQuery(`${pendingRecords.length} pending records`);

      // 首轮无 pending 时，等待正在消化中的 record 完成（最多 90s）
      if (pendingRecords.length === 0 && batch === 0) {
        const undigestedCount = await recordRepo.countUndigested(userId);
        if (undigestedCount > 0) {
          console.log(`[wiki-compiler] 无 pending record，但有 ${undigestedCount} 条正在消化，等待...`);
          for (let wait = 0; wait < 6; wait++) {
            await new Promise((r) => setTimeout(r, 15_000));
            pendingRecords = await recordRepo.findPendingCompile(userId, maxRecords);
            if (pendingRecords.length > 0) break;
          }
        }
      }

      if (pendingRecords.length === 0) {
        console.log(`[wiki-compiler] 第 ${batch + 1} 轮无待编译 record，结束循环`);
        break;
      }

      console.log(`[wiki-compiler] 第 ${batch + 1} 轮，处理 ${pendingRecords.length} 条 record`);

      // 加载 record 文本
      const tLoadText = T(`batch-${batch + 1}/load-text`);
      const recordsWithText = await loadRecordTexts(pendingRecords);
      const withText = recordsWithText.filter((r) => r.text.length > 0).length;
      tLoadText(`${withText} have text`);

      // 通过 wiki_page_record 表查询 record→page 关联（替代 embedding 路由）
      const tRoute = T(`batch-${batch + 1}/route`);
      const recordIds = pendingRecords.map((r) => r.id);
      const pageRecordLinks = await findPagesByRecords(recordIds);
      const matchedPageIds = new Set(pageRecordLinks.map((pr) => pr.wiki_page_id));
      tRoute(`${matchedPageIds.size} pages matched via wiki_page_record`);

      // 加载所有 active page 索引（用于 AI prompt）
      const tLoadPages = T(`batch-${batch + 1}/load-pages`);
      const allPages = await wikiPageRepo.findByUser(userId, { status: "active" });
      const isColdStart = allPages.length === 0;
      tLoadPages(`${allPages.length} pages, coldStart=${isColdStart}`);

      const allPageIndex: PageIndex[] = allPages.map((p) => ({
        id: p.id,
        title: p.title,
        summary: p.summary,
        level: p.level,
        page_type: p.page_type,
      }));

      // 加载关联 page 的完整 content
      const tLoadMatched = T(`batch-${batch + 1}/load-matched`);
      const matchedPages = await loadMatchedPages(matchedPageIds, allPages);
      const totalContentChars = matchedPages.reduce((s, p) => s + p.content.length, 0);
      tLoadMatched(`${matchedPages.length} pages loaded, ${totalContentChars} chars content`);

      // 加载已有 goals（用于 AI prompt 去重参照）
      const existingGoals = await todoRepo.findActiveGoalsByUser(userId);

      // ── 阶段 B: 编译（AI 调用）──
      const promptInput = {
        newRecords: recordsWithText.map((r) => ({
          id: r.id,
          text: r.text,
          source_type: r.source_type,
          created_at: r.created_at,
        })),
        matchedPages: matchedPages.map((p) => ({
          id: p.id,
          title: p.title,
          content: p.content,
          summary: p.summary,
          level: p.level,
        })),
        allPageIndex: allPageIndex.map((p) => ({
          id: p.id,
          title: p.title,
          summary: p.summary,
          level: p.level,
          page_type: p.page_type,
        })),
        existingGoals: existingGoals.slice(0, 20).map((g) => ({
          id: g.id,
          title: g.text,
          status: g.status ?? "active",
          wiki_page_id: g.wiki_page_id ?? null,
        })),
        isColdStart,
      };

      const { system, user } = buildCompilePrompt(promptInput);
      const promptTokenEst = Math.round((system.length + user.length) / 1.5);
      console.log(`[wiki-compiler] prompt 预估 ~${promptTokenEst} tokens (system=${system.length} + user=${user.length} chars)`);

      const tAI = T(`batch-${batch + 1}/ai-call`);
      let instructions: CompileInstructions;
      try {
        instructions = await callAIWithRetry(system, user, promptInput, recordsWithText);
        tAI(`update=${instructions.update_pages.length} create=${instructions.create_pages.length} split=${instructions.split_page.length} merge=${instructions.merge_pages.length} goal=${instructions.goal_sync.length}`);
      } catch (err: any) {
        tAI(`FAILED: ${err.message}`);
        console.error(`[wiki-compiler] AI 调用失败（第 ${batch + 1} 轮）: ${err.message}`);
        break;
      }

      // ── 阶段 C: 执行指令（单 DB 事务）──
      const tExec = T(`batch-${batch + 1}/execute`);
      const batchResult = await executeInstructions(
        instructions,
        userId,
        pendingRecords.map((r) => r.id),
      );
      tExec(`created=${batchResult.pages_created} updated=${batchResult.pages_updated} compiled=${batchResult.records_compiled}`);

      // 累加批次结果
      emptyResult.pages_created += batchResult.pages_created;
      emptyResult.pages_updated += batchResult.pages_updated;
      emptyResult.pages_split += batchResult.pages_split;
      emptyResult.pages_merged += batchResult.pages_merged;
      emptyResult.records_compiled += batchResult.records_compiled;

      tBatch(`done`);
      // 本轮处理的 record 少于 maxRecords，说明已全部处理完
      if (pendingRecords.length < maxRecords) break;
    }
    tTotal(`all batches done, compiled=${emptyResult.records_compiled}`);

    // 构建总体变更摘要
    if (emptyResult.records_compiled > 0) {
      const summaryParts: string[] = [];
      if (emptyResult.pages_created > 0) summaryParts.push(`新建 ${emptyResult.pages_created} 个 page`);
      if (emptyResult.pages_updated > 0) summaryParts.push(`更新 ${emptyResult.pages_updated} 个 page`);
      if (emptyResult.pages_split > 0) summaryParts.push(`拆分 ${emptyResult.pages_split} 个 page`);
      if (emptyResult.pages_merged > 0) summaryParts.push(`合并 ${emptyResult.pages_merged} 个 page`);
      if (summaryParts.length > 0) {
        emptyResult.summary = `编译完成：${summaryParts.join("，")}，处理了 ${emptyResult.records_compiled} 条记录`;
      }
    }

    return emptyResult;
  } finally {
    compileLocks.delete(lockKey);
    console.log(`[wiki-compiler] 锁释放: ${lockKey}`);
  }
}

// ── 阶段 A 辅助函数 ──

/** 加载 record 的 transcript/summary 文本 */
async function loadRecordTexts(
  records: recordRepo.Record[],
): Promise<RecordWithText[]> {
  const { query } = await import("../db/pool.js");

  const ids = records.map((r) => r.id);
  if (ids.length === 0) return [];

  // 批量查询 transcript 和 summary
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");

  const transcripts = await query<{ record_id: string; text: string }>(
    `SELECT record_id, text FROM transcript WHERE record_id IN (${placeholders})`,
    ids,
  );
  const summaries = await query<{ record_id: string; short_summary: string }>(
    `SELECT record_id, short_summary FROM summary WHERE record_id IN (${placeholders})`,
    ids,
  );

  const textMap = new Map<string, string>();

  for (const t of transcripts) {
    textMap.set(t.record_id, t.text);
  }
  for (const s of summaries) {
    if (!textMap.has(s.record_id)) {
      textMap.set(s.record_id, s.short_summary);
    }
  }

  return records.map((r) => ({
    id: r.id,
    text: textMap.get(r.id) ?? "",
    source_type: r.source_type,
    created_at: r.created_at,
  }));
}

/** 加载关联 page 的完整 content，按最近更新优先，受 token 预算限制 */
async function loadMatchedPages(
  matchedPageIds: Set<string>,
  allPages: wikiPageRepo.WikiPage[],
): Promise<MatchedPage[]> {
  // 预建索引避免 O(N*M) 查找
  const pageMap = new Map(allPages.map(p => [p.id, p]));

  // 按 updated_at 降序排列，优先加载最近活跃的 page
  const sorted = [...matchedPageIds]
    .map(id => pageMap.get(id))
    .filter((p): p is wikiPageRepo.WikiPage => !!p)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));

  const pages: MatchedPage[] = [];
  let totalChars = 0;

  for (const page of sorted) {
    const contentLen = (page.content ?? "").length;
    if (totalChars + contentLen > MAX_CONTENT_CHARS) break;

    totalChars += contentLen;
    pages.push({
      id: page.id,
      title: page.title,
      content: page.content,
      summary: page.summary ?? "",
      level: page.level,
    });
  }

  return pages;
}

// ── 阶段 B: AI 调用 ──

/** AI 调用（含超时重试，重试时缩减 record 但保留 wiki 上下文） */
async function callAIWithRetry(
  system: string,
  user: string,
  promptInput: Parameters<typeof buildCompilePrompt>[0],
  recordsWithText: RecordWithText[],
): Promise<CompileInstructions> {
  try {
    return await callAI(system, user);
  } catch (err: any) {
    // 超时重试：缩减 record 数量为一半，保留 wiki 上下文
    if (err.name === "AbortError" || err.message?.includes("timeout")) {
      const halfCount = Math.max(1, Math.floor(recordsWithText.length / 2));
      console.warn(`[wiki-compiler] AI 超时，重试（record 从 ${recordsWithText.length} 缩减到 ${halfCount}）`);

      const reducedRecords = recordsWithText.slice(0, halfCount);
      const { buildCompilePrompt: rebuild } = await import("./wiki-compile-prompt.js");
      const newPrompt = rebuild({
        ...promptInput,
        newRecords: reducedRecords.map((r) => ({
          id: r.id,
          text: r.text,
          source_type: r.source_type,
          created_at: r.created_at,
        })),
      });
      return await callAI(newPrompt.system, newPrompt.user);
    }
    throw err;
  }
}

/** 单次 AI 调用 */
async function callAI(system: string, user: string): Promise<CompileInstructions> {
  const response = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      json: true,
      tier: "agent",
      timeout: AI_TIMEOUT_MS,
      temperature: 0.3,
    },
  );

  return parseCompileResponse(response.content);
}

/** 解析 AI 返回的 JSON */
export function parseCompileResponse(raw: string): CompileInstructions {
  // 尝试提取 JSON（AI 可能包裹在 ```json ... ``` 中）
  let jsonStr = raw.trim();
  const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // 尝试匹配最外层 { ... }
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    jsonStr = braceMatch[0];
  }

  const parsed = JSON.parse(jsonStr);

  // 验证并规范化
  return {
    update_pages: Array.isArray(parsed.update_pages) ? parsed.update_pages : [],
    create_pages: Array.isArray(parsed.create_pages) ? parsed.create_pages : [],
    merge_pages: Array.isArray(parsed.merge_pages) ? parsed.merge_pages : [],
    split_page: Array.isArray(parsed.split_page) ? parsed.split_page : [],
    goal_sync: Array.isArray(parsed.goal_sync) ? parsed.goal_sync : [],
    links: Array.isArray(parsed.links) ? parsed.links : [],
  };
}

// ── 阶段 C: 执行指令 ──

/** 在单个 DB 事务中执行编译指令 */
/** UUID v4 格式校验 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(s: string | null | undefined): boolean {
  return typeof s === "string" && UUID_RE.test(s);
}

export async function executeInstructions(
  instructions: CompileInstructions,
  userId: string,
  recordIds: string[],
): Promise<CompileResult> {
  const pool = getPool();
  const client = await pool.connect();
  const result: CompileResult = {
    pages_created: 0,
    pages_updated: 0,
    pages_split: 0,
    pages_merged: 0,
    records_compiled: 0,
  };

  try {
    await client.query("BEGIN");
    // 编译事务可能涉及大量写入，禁用 pool 默认的 10s statement_timeout
    await client.query("SET LOCAL statement_timeout = 0");

    // 1. update_pages
    for (const upd of instructions.update_pages) {
      if (!isValidUuid(upd.page_id)) {
        console.warn(`[wiki-compiler] 跳过 update_pages: 无效 page_id "${upd.page_id}"`);
        continue;
      }
      // 验证 page 存在
      if (!(await wikiPageRepo.exists(upd.page_id, client))) {
        console.warn(`[wiki-compiler] 跳过 update_pages: page 不存在 "${upd.page_id}"`);
        continue;
      }
      await wikiPageRepo.update(upd.page_id, {
        content: upd.new_content,
        summary: upd.new_summary,
        compiled_at: tzNow().toISOString(),
      }, client);
      // Phase 7: 热力事件（fire-and-forget，不在事务内）
      wikiPageEventRepo.recordEvent(upd.page_id, "compile_hit").catch(() => {});
      for (const recId of upd.add_record_ids) {
        if (!isValidUuid(recId)) continue;
        // 保留 raw SQL：link 没有 WHERE EXISTS(record) 防护
        await client.query(
          `INSERT INTO wiki_page_record (wiki_page_id, record_id)
           SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM record WHERE id = $2)
           ON CONFLICT DO NOTHING`,
          [upd.page_id, recId],
        );
      }
      result.pages_updated++;
    }

    // 2. create_pages
    for (const cp of instructions.create_pages) {
      if (cp.parent_id && !isValidUuid(cp.parent_id)) {
        console.warn(`[wiki-compiler] create_pages: 无效 parent_id "${cp.parent_id}"，置为 null`);
        cp.parent_id = null;
      }
      const newPage = await wikiPageRepo.create({
        user_id: userId,
        title: cp.title,
        content: cp.content,
        summary: cp.summary,
        parent_id: cp.parent_id ?? undefined,
        level: cp.level ?? 3,
      }, client);
      const newPageId = newPage.id;
      for (const recId of cp.record_ids) {
        if (!isValidUuid(recId)) continue;
        // 保留 raw SQL：link 没有 WHERE EXISTS(record) 防护
        await client.query(
          `INSERT INTO wiki_page_record (wiki_page_id, record_id)
           SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM record WHERE id = $2)
           ON CONFLICT DO NOTHING`,
          [newPageId, recId],
        );
      }
      result.pages_created++;
    }

    // 3. split_page（含分级授权检查）
    // TODO Phase 14.7: 当 AI 指令集支持 rename/archive 操作时，需同样加 canAiModifyStructure 检查
    for (const sp of instructions.split_page) {
      if (!isValidUuid(sp.source_id)) {
        console.warn(`[wiki-compiler] 跳过 split_page: 无效 source_id "${sp.source_id}"`);
        continue;
      }
      if (!(await wikiPageRepo.exists(sp.source_id, client))) {
        console.warn(`[wiki-compiler] 跳过 split_page: page 不存在 "${sp.source_id}"`);
        continue;
      }

      // Phase 14.7: 分级授权 — 检查 page 的 created_by
      const spPage = await wikiPageRepo.findById(sp.source_id, client);
      if (spPage && !canAiModifyStructure(spPage as any)) {
        // 用户创建的 page → 不执行拆分，创建建议
        console.log(`[wiki-compiler] split_page: page "${sp.source_id}" 由用户创建，创建建议`);
        await createSuggestion(userId, "split", {
          source_id: sp.source_id,
          new_parent_content: sp.new_parent_content,
          children: sp.children,
        });
        continue;
      }

      // 更新原 page 的 content
      await wikiPageRepo.update(sp.source_id, {
        content: sp.new_parent_content,
        compiled_at: tzNow().toISOString(),
      }, client);
      // 创建子 page
      const parentPage = spPage;
      const childLevel = Math.max((parentPage?.level ?? 3) - 1, 1);
      for (const child of sp.children) {
        const childPage = await wikiPageRepo.create({
          user_id: userId,
          title: child.title,
          content: child.content,
          summary: child.summary,
          parent_id: sp.source_id,
          level: childLevel,
        }, client);
        // 子 page 继承原 page 的 record 关联（spec 3.3 要求）
        if (childPage.id) {
          await wikiPageRecordRepo.inheritAll(sp.source_id, childPage.id, client);
        }
      }
      result.pages_split++;
    }

    // 4. merge_pages（含分级授权检查）
    for (const mp of instructions.merge_pages) {
      if (!isValidUuid(mp.source_id) || !isValidUuid(mp.target_id)) {
        console.warn(`[wiki-compiler] 跳过 merge_pages: 无效 UUID source="${mp.source_id}" target="${mp.target_id}"`);
        continue;
      }
      const mpSrcExists = await wikiPageRepo.exists(mp.source_id, client);
      const mpTgtExists = await wikiPageRepo.exists(mp.target_id, client);
      if (!mpSrcExists || !mpTgtExists) {
        console.warn(`[wiki-compiler] 跳过 merge_pages: source/target 不存在`);
        continue;
      }

      // Phase 14.7: 分级授权 — 检查 source page 的 created_by
      const mpSrcPage = await wikiPageRepo.findById(mp.source_id, client);
      if (mpSrcPage && !canAiModifyStructure(mpSrcPage as any)) {
        console.log(`[wiki-compiler] merge_pages: source "${mp.source_id}" 由用户创建，创建建议`);
        await createSuggestion(userId, "merge", {
          source_id: mp.source_id,
          target_id: mp.target_id,
          reason: mp.reason,
        });
        continue;
      }

      // source 标记为 merged
      await wikiPageRepo.update(mp.source_id, {
        status: "merged",
        merged_into: mp.target_id,
      }, client);
      // 迁移 record 关联（CTE: DELETE source + INSERT target，语义等价）
      await wikiPageRecordRepo.transferAll(mp.source_id, mp.target_id, client);
      // 迁移 goal 关联
      await todoRepo.transferWikiPageRef(mp.source_id, mp.target_id, client);
      result.pages_merged++;
    }

    // 5. goal_sync
    for (const gs of instructions.goal_sync) {
      if (gs.wiki_page_id && !isValidUuid(gs.wiki_page_id)) {
        console.warn(`[wiki-compiler] goal_sync: 无效 wiki_page_id "${gs.wiki_page_id}"，置为 null`);
        gs.wiki_page_id = undefined;
      }
      if (gs.parent_page_id && !isValidUuid(gs.parent_page_id)) {
        console.warn(`[wiki-compiler] goal_sync: 无效 parent_page_id "${gs.parent_page_id}"，置为 null`);
        gs.parent_page_id = undefined;
      }
      if (gs.goal_id && !isValidUuid(gs.goal_id)) {
        console.warn(`[wiki-compiler] 跳过 goal_sync update: 无效 goal_id "${gs.goal_id}"`);
        continue;
      }
      if (gs.action === "create" && gs.title) {
        // DB 兜底去重：精确文本匹配
        const dupTodo = await client.query(
          `SELECT id FROM todo WHERE user_id = $1 AND level >= 1 AND LOWER(TRIM(text)) = LOWER(TRIM($2)) AND done = false`,
          [userId, gs.title],
        );
        if (dupTodo.rows.length > 0) {
          console.warn(`[wiki-compiler] goal_sync create skipped: duplicate title "${gs.title}" (existing id: ${dupTodo.rows[0].id})`);
          continue;
        }

        // Phase 14.6: goal_sync create 同时创建 goal page
        let goalPageId = gs.wiki_page_id ?? null;
        if (goalPageId) {
          if (!(await wikiPageRepo.exists(goalPageId, client))) {
            console.warn(`[wiki-compiler] goal_sync create: wiki_page_id 不存在 "${goalPageId}"，置为 null`);
            goalPageId = null;
          }
        }

        // goal page 标题查重：复用已有同标题 goal page
        if (!goalPageId) {
          const dupPage = await client.query(
            `SELECT id FROM wiki_page WHERE user_id = $1 AND page_type = 'goal' AND LOWER(TRIM(title)) = LOWER(TRIM($2)) AND status = 'active'`,
            [userId, gs.title],
          );
          if (dupPage.rows.length > 0) {
            goalPageId = dupPage.rows[0].id;
          }
        }

        // 如果没有已有的 goal page，创建一个新的（支持 parent_page_id 挂载）
        if (!goalPageId) {
          // 处理 parent_page_id：推导 parent_id 和 level
          let parentId: string | null = null;
          let goalLevel = 3;
          if (gs.parent_page_id) {
            const parentExists = await wikiPageRepo.exists(gs.parent_page_id, client);
            if (parentExists) {
              const parentPage = await wikiPageRepo.findById(gs.parent_page_id, client);
              parentId = gs.parent_page_id;
              goalLevel = Math.max(1, (parentPage?.level ?? 3) - 1);
            }
          }

          const newGoalPage = await wikiPageRepo.create({
            user_id: userId,
            title: gs.title,
            content: "",
            summary: gs.title,
            parent_id: parentId ?? undefined,
            level: goalLevel,
            page_type: "goal",
            created_by: "ai",
          }, client);
          goalPageId = newGoalPage.id ?? null;
          if (goalPageId) {
            result.pages_created++;
          }
        }

        // 保留 raw SQL：recordRepo 没有按 user_id 查 device_id 的方法
        const deviceRow = await client.query(
          `SELECT device_id FROM record WHERE user_id = $1 LIMIT 1`,
          [userId],
        );
        const deviceId = deviceRow.rows[0]?.device_id ?? userId;

        await todoRepo.create({
          device_id: deviceId,
          user_id: userId,
          text: gs.title,
          status: gs.status ?? "active",
          level: 1,
          done: false,
          category: "emerged",
          wiki_page_id: goalPageId ?? undefined,
        }, client);
      } else if (gs.action === "update" && gs.goal_id) {
        // 保留 raw SQL：动态 SET 构造 + AND level >= 1 条件，repo update 不支持
        const sets: string[] = ["updated_at = now()"];
        const params: any[] = [];
        let i = 1;
        if (gs.status) {
          sets.push(`status = $${i++}`);
          params.push(gs.status);
          sets.push(`done = $${i++}`);
          params.push(gs.status === "completed");
        }
        if (gs.wiki_page_id) {
          if (!(await wikiPageRepo.exists(gs.wiki_page_id, client))) {
            console.warn(`[wiki-compiler] goal_sync update: wiki_page_id 不存在，跳过`);
          } else {
            sets.push(`wiki_page_id = $${i++}`);
            params.push(gs.wiki_page_id);
          }
        }
        if (params.length > 0) {
          params.push(gs.goal_id);
          await client.query(
            `UPDATE todo SET ${sets.join(", ")} WHERE id = $${i} AND level >= 1`,
            params,
          );
        }
      }
    }

    // 6. links — 创建跨页链接（Phase 14.11，AI 幻觉 ID 防护）
    if (instructions.links && instructions.links.length > 0) {
      for (const link of instructions.links) {
        if (!isValidUuid(link.source_page_id) || !isValidUuid(link.target_page_id)) {
          console.warn(`[wiki-compiler] 跳过 link: 无效 UUID source="${link.source_page_id}" target="${link.target_page_id}"`);
          continue;
        }
        // 存在性校验（AI 可能编造不存在的 page_id）
        const srcExists = await wikiPageRepo.exists(link.source_page_id, client);
        const tgtExists = await wikiPageRepo.exists(link.target_page_id, client);
        if (!srcExists || !tgtExists) {
          console.warn(`[wiki-compiler] 跳过 link: page 不存在 source="${link.source_page_id}" target="${link.target_page_id}"`);
          continue;
        }
        // link_type 校验
        const validTypes = ["reference", "related", "contradicts"];
        if (!validTypes.includes(link.link_type)) {
          console.warn(`[wiki-compiler] 跳过 link: 无效 link_type "${link.link_type}"`);
          continue;
        }
        await wikiPageLinkRepo.createLink({
          source_page_id: link.source_page_id,
          target_page_id: link.target_page_id,
          link_type: link.link_type,
          context_text: link.context_text ?? undefined,
        }, client);
      }
    }

    // 7. 所有 Record 标记为 compiled
    if (recordIds.length > 0) {
      // 批量更新使用 ANY($1) 语法，recordRepo.updateCompileStatus 只支持单条，保留 raw SQL
      await client.query(
        `UPDATE record SET compile_status = 'compiled', updated_at = now() WHERE id = ANY($1)`,
        [recordIds],
      );
      result.records_compiled = recordIds.length;
    }

    await client.query("COMMIT");

    // 刷新编译后 record 的 hierarchy_tags（火后不管）
    if (recordIds.length > 0) {
      import("./tag-projector.js")
        .then((tp) => tp.batchRefreshByRecordIds(recordIds))
        .catch((e) => console.warn("[wiki-compiler] tag refresh failed:", e));
    }

    // 构建变更摘要
    const summaryParts: string[] = [];
    if (result.pages_created > 0) summaryParts.push(`新建 ${result.pages_created} 个 page`);
    if (result.pages_updated > 0) summaryParts.push(`更新 ${result.pages_updated} 个 page`);
    if (result.pages_split > 0) summaryParts.push(`拆分 ${result.pages_split} 个 page`);
    if (result.pages_merged > 0) summaryParts.push(`合并 ${result.pages_merged} 个 page`);
    if (summaryParts.length > 0) {
      result.summary = `编译完成：${summaryParts.join("，")}，处理了 ${result.records_compiled} 条记录`;
    }

    // Phase 8: 编译日志写入
    if (result.records_compiled > 0) {
      execute(
        `INSERT INTO wiki_compile_log (user_id, pages_created, pages_updated, records_compiled, change_summary, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, result.pages_created, result.pages_updated, result.records_compiled, result.summary ?? null, 0],
      ).catch((e) => console.warn("[wiki-compiler] compile log write failed:", e));
    }

    return result;
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[wiki-compiler] 事务执行失败，已回滚: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

