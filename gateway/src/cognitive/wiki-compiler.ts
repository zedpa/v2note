/**
 * Wiki 编译引擎主入口 — 每日/手动触发的知识编译
 *
 * 三阶段流程：
 *   A. 路由（轻量，不调 AI）— embedding 匹配 record→page
 *   B. 编译（1 次 AI 调用）— 生成编译指令
 *   C. 执行指令（单个 DB 事务）— 原子写入
 */

import { getPool } from "../db/pool.js";
import * as recordRepo from "../db/repositories/record.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as goalRepo from "../db/repositories/goal.js";
import { chatCompletion } from "../ai/provider.js";
import { getEmbedding } from "../memory/embeddings.js";
import { buildCompilePrompt } from "./wiki-compile-prompt.js";
import { today as tzToday } from "../lib/tz.js";
import type { PoolClient } from "pg";

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
    domain: string | null;
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
    progress?: number;
  }>;
}

/** Record 加载后的文本信息 */
interface RecordWithText {
  id: string;
  text: string;
  source_type: string;
  created_at: string;
  embedding: number[] | null;
}

/** Page 的索引信息（不含 content） */
interface PageIndex {
  id: string;
  title: string;
  summary: string | null;
  level: number;
  domain: string | null;
  embedding: number[] | null;
}

/** 命中的 page（含完整 content） */
interface MatchedPage {
  id: string;
  title: string;
  content: string;
  summary: string;
  level: number;
  domain: string | null;
}

// ── 内存级并发锁（替代 advisory lock，避免 pooler 长连接超时） ──
const compileLocks = new Set<string>();

// ── token 预算常量 ──

/** 命中 page content 总量上限（字符数），1 token ≈ 1.5 中文字符 → 30000 tokens ≈ 45000 字符 */
const MAX_CONTENT_CHARS = 45000;

/** 相似度阈值 */
const SIMILARITY_THRESHOLD = 0.5;

/** 每条 record 最多匹配的 page 数 */
const MAX_MATCHED_PAGES = 10;

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
      const withEmbedding = recordsWithText.filter((r) => r.embedding).length;
      const withText = recordsWithText.filter((r) => r.text.length > 0).length;
      tLoadText(`${withText} have text, ${withEmbedding} have embedding`);

      // 加载所有 active page 索引
      const tLoadPages = T(`batch-${batch + 1}/load-pages`);
      const allPages = await wikiPageRepo.findByUser(userId, { status: "active" });
      const isColdStart = allPages.length === 0;
      const pagesWithEmb = allPages.filter((p) => p.embedding).length;
      tLoadPages(`${allPages.length} pages (${pagesWithEmb} with embedding), coldStart=${isColdStart}`);

      const allPageIndex: PageIndex[] = allPages.map((p) => ({
        id: p.id,
        title: p.title,
        summary: p.summary,
        level: p.level,
        domain: p.domain,
        embedding: p.embedding,
      }));

      // embedding 路由
      const tRoute = T(`batch-${batch + 1}/route`);
      const matchedPageMap = await routeRecordsToPages(recordsWithText, allPageIndex);
      tRoute(`${matchedPageMap.size} pages matched`);

      // 加载命中 page 完整 content
      const tLoadMatched = T(`batch-${batch + 1}/load-matched`);
      const matchedPages = await loadMatchedPages(matchedPageMap, allPages);
      const totalContentChars = matchedPages.reduce((s, p) => s + p.content.length, 0);
      tLoadMatched(`${matchedPages.length} pages loaded, ${totalContentChars} chars content`);

      const existingDomains = [...new Set(allPages.map((p) => p.domain).filter(Boolean) as string[])];

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
          domain: p.domain,
        })),
        allPageIndex: allPageIndex.map((p) => ({
          id: p.id,
          title: p.title,
          summary: p.summary,
          level: p.level,
          domain: p.domain,
        })),
        existingDomains,
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

      // 更新被修改 page 的 embedding（异步，不阻塞）
      void updatePageEmbeddings(instructions, userId).catch((err) =>
        console.warn(`[wiki-compiler] embedding 更新失败: ${err.message}`),
      );

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

/** 加载 record 的 transcript/summary 文本 + embedding */
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

  // 查询 embedding
  const embeddings = await query<{ id: string; embedding: any }>(
    `SELECT id, embedding FROM record WHERE id IN (${placeholders}) AND embedding IS NOT NULL`,
    ids,
  );

  const textMap = new Map<string, string>();
  const embeddingMap = new Map<string, number[]>();

  for (const t of transcripts) {
    textMap.set(t.record_id, t.text);
  }
  for (const s of summaries) {
    if (!textMap.has(s.record_id)) {
      textMap.set(s.record_id, s.short_summary);
    }
  }
  for (const e of embeddings) {
    if (e.embedding) {
      embeddingMap.set(e.id, parseEmbedding(e.embedding));
    }
  }

  return records.map((r) => ({
    id: r.id,
    text: textMap.get(r.id) ?? "",
    source_type: r.source_type,
    created_at: r.created_at,
    embedding: embeddingMap.get(r.id) ?? null,
  }));
}

/** 解析 pgvector 的 embedding 值 */
function parseEmbedding(raw: any): number[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    // pgvector 返回 "[0.1,0.2,0.3]" 格式
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

/** 余弦相似度计算 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** 将 record 路由到相关 page（基于 embedding 相似度），返回 pageId → 最高相似度 */
async function routeRecordsToPages(
  records: RecordWithText[],
  pages: PageIndex[],
): Promise<Map<string, number>> {
  const matchedMap = new Map<string, number>();

  for (const record of records) {
    if (!record.embedding || pages.length === 0) continue;

    const scored: Array<{ pageId: string; similarity: number }> = [];
    for (const page of pages) {
      if (!page.embedding) continue;
      const sim = cosineSimilarity(record.embedding, page.embedding);
      if (sim > SIMILARITY_THRESHOLD) {
        scored.push({ pageId: page.id, similarity: sim });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    for (const s of scored.slice(0, MAX_MATCHED_PAGES)) {
      const existing = matchedMap.get(s.pageId) ?? 0;
      if (s.similarity > existing) matchedMap.set(s.pageId, s.similarity);
    }
  }

  return matchedMap;
}

/** 加载命中 page 的完整 content，按相似度排序，受 token 预算限制 */
async function loadMatchedPages(
  matchedMap: Map<string, number>,
  allPages: wikiPageRepo.WikiPage[],
): Promise<MatchedPage[]> {
  // 按相似度降序排序后截断（spec 3.1 要求）
  const sorted = [...matchedMap.entries()].sort((a, b) => b[1] - a[1]);

  const pages: MatchedPage[] = [];
  let totalChars = 0;

  for (const [pageId] of sorted) {
    const page = allPages.find((p) => p.id === pageId);
    if (!page) continue;

    const contentLen = (page.content ?? "").length;
    if (totalChars + contentLen > MAX_CONTENT_CHARS) break;

    totalChars += contentLen;
    pages.push({
      id: page.id,
      title: page.title,
      content: page.content,
      summary: page.summary ?? "",
      level: page.level,
      domain: page.domain,
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
      const pageExists = await client.query(`SELECT 1 FROM wiki_page WHERE id = $1`, [upd.page_id]);
      if (pageExists.rowCount === 0) {
        console.warn(`[wiki-compiler] 跳过 update_pages: page 不存在 "${upd.page_id}"`);
        continue;
      }
      await client.query(
        `UPDATE wiki_page SET content = $1, summary = $2, compiled_at = now(), updated_at = now() WHERE id = $3`,
        [upd.new_content, upd.new_summary, upd.page_id],
      );
      for (const recId of upd.add_record_ids) {
        if (!isValidUuid(recId)) continue;
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
      const createResult = await client.query(
        `INSERT INTO wiki_page (user_id, title, content, summary, parent_id, level, domain, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          userId,
          cp.title,
          cp.content,
          cp.summary,
          cp.parent_id ?? null,
          cp.level ?? 3,
          cp.domain ?? null,
          JSON.stringify({}),
        ],
      );
      const newPageId = createResult.rows[0].id;
      for (const recId of cp.record_ids) {
        if (!isValidUuid(recId)) continue;
        await client.query(
          `INSERT INTO wiki_page_record (wiki_page_id, record_id)
           SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM record WHERE id = $2)
           ON CONFLICT DO NOTHING`,
          [newPageId, recId],
        );
      }
      result.pages_created++;
    }

    // 3. split_page
    for (const sp of instructions.split_page) {
      if (!isValidUuid(sp.source_id)) {
        console.warn(`[wiki-compiler] 跳过 split_page: 无效 source_id "${sp.source_id}"`);
        continue;
      }
      const spExists = await client.query(`SELECT 1 FROM wiki_page WHERE id = $1`, [sp.source_id]);
      if (spExists.rowCount === 0) {
        console.warn(`[wiki-compiler] 跳过 split_page: page 不存在 "${sp.source_id}"`);
        continue;
      }
      // 更新原 page 的 content
      await client.query(
        `UPDATE wiki_page SET content = $1, compiled_at = now(), updated_at = now() WHERE id = $2`,
        [sp.new_parent_content, sp.source_id],
      );
      // 创建子 page
      for (const child of sp.children) {
        const childResult = await client.query(
          `INSERT INTO wiki_page (user_id, title, content, summary, parent_id, level, domain, metadata)
           VALUES ($1, $2, $3, $4, $5,
                   (SELECT GREATEST(level - 1, 1) FROM wiki_page WHERE id = $5),
                   (SELECT domain FROM wiki_page WHERE id = $5),
                   $6) RETURNING id`,
          [
            userId,
            child.title,
            child.content,
            child.summary,
            sp.source_id,
            JSON.stringify({}),
          ],
        );
        // 子 page 继承原 page 的 record 关联（spec 3.3 要求）
        const childId = childResult.rows[0]?.id;
        if (childId) {
          await client.query(
            `INSERT INTO wiki_page_record (wiki_page_id, record_id)
             SELECT $1, record_id FROM wiki_page_record WHERE wiki_page_id = $2
             ON CONFLICT DO NOTHING`,
            [childId, sp.source_id],
          );
        }
      }
      result.pages_split++;
    }

    // 4. merge_pages
    for (const mp of instructions.merge_pages) {
      if (!isValidUuid(mp.source_id) || !isValidUuid(mp.target_id)) {
        console.warn(`[wiki-compiler] 跳过 merge_pages: 无效 UUID source="${mp.source_id}" target="${mp.target_id}"`);
        continue;
      }
      const mpSrcExists = await client.query(`SELECT 1 FROM wiki_page WHERE id = $1`, [mp.source_id]);
      const mpTgtExists = await client.query(`SELECT 1 FROM wiki_page WHERE id = $1`, [mp.target_id]);
      if (mpSrcExists.rowCount === 0 || mpTgtExists.rowCount === 0) {
        console.warn(`[wiki-compiler] 跳过 merge_pages: source/target 不存在`);
        continue;
      }
      // source 标记为 merged
      await client.query(
        `UPDATE wiki_page SET status = 'merged', merged_into = $1, updated_at = now() WHERE id = $2`,
        [mp.target_id, mp.source_id],
      );
      // 迁移 record 关联（先删除重复再迁移，避免 PK 冲突）
      await client.query(
        `DELETE FROM wiki_page_record WHERE wiki_page_id = $1
         AND record_id IN (SELECT record_id FROM wiki_page_record WHERE wiki_page_id = $2)`,
        [mp.source_id, mp.target_id],
      );
      await client.query(
        `UPDATE wiki_page_record SET wiki_page_id = $1 WHERE wiki_page_id = $2`,
        [mp.target_id, mp.source_id],
      );
      // 迁移 goal 关联
      await client.query(
        `UPDATE todo SET wiki_page_id = $1 WHERE wiki_page_id = $2 AND level >= 1`,
        [mp.target_id, mp.source_id],
      );
      result.pages_merged++;
    }

    // 5. goal_sync
    for (const gs of instructions.goal_sync) {
      if (gs.wiki_page_id && !isValidUuid(gs.wiki_page_id)) {
        console.warn(`[wiki-compiler] goal_sync: 无效 wiki_page_id "${gs.wiki_page_id}"，置为 null`);
        gs.wiki_page_id = undefined;
      }
      if (gs.goal_id && !isValidUuid(gs.goal_id)) {
        console.warn(`[wiki-compiler] 跳过 goal_sync update: 无效 goal_id "${gs.goal_id}"`);
        continue;
      }
      if (gs.action === "create" && gs.title) {
        // 验证 wiki_page_id 存在
        let goalPageId = gs.wiki_page_id ?? null;
        if (goalPageId) {
          const gpExists = await client.query(`SELECT 1 FROM wiki_page WHERE id = $1`, [goalPageId]);
          if (gpExists.rowCount === 0) {
            console.warn(`[wiki-compiler] goal_sync create: wiki_page_id 不存在 "${goalPageId}"，置为 null`);
            goalPageId = null;
          }
        }
        const deviceRow = await client.query(
          `SELECT device_id FROM record WHERE user_id = $1 LIMIT 1`,
          [userId],
        );
        const deviceId = deviceRow.rows[0]?.device_id ?? userId;

        await client.query(
          `INSERT INTO todo (device_id, user_id, text, status, level, done, category, wiki_page_id)
           VALUES ($1, $2, $3, $4, 1, false, 'emerged', $5)`,
          [deviceId, userId, gs.title, gs.status ?? "active", goalPageId],
        );
      } else if (gs.action === "update" && gs.goal_id) {
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
          const guExists = await client.query(`SELECT 1 FROM wiki_page WHERE id = $1`, [gs.wiki_page_id]);
          if (guExists.rowCount === 0) {
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

    // 6. 所有 Record 标记为 compiled
    if (recordIds.length > 0) {
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

    return result;
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[wiki-compiler] 事务执行失败，已回滚: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

// ── 后处理 ──

/** 更新被修改 page 的 embedding */
async function updatePageEmbeddings(
  instructions: CompileInstructions,
  _userId: string,
): Promise<void> {
  const pageIdsToUpdate = new Set<string>();

  for (const upd of instructions.update_pages) {
    pageIdsToUpdate.add(upd.page_id);
  }
  // 新建的 page 也需要 embedding，但我们需要获取新建 page 的 ID
  // 由于新建 page 的 ID 在事务中生成，这里需要重新查询
  // 暂时只更新已有 page 的 embedding

  for (const pageId of pageIdsToUpdate) {
    try {
      const page = await wikiPageRepo.findById(pageId);
      if (!page || !page.summary) continue;

      const embedding = await getEmbedding(page.summary);
      await wikiPageRepo.update(pageId, {
        embedding,
        compiled_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn(`[wiki-compiler] page ${pageId} embedding 更新失败: ${err.message}`);
    }
  }
}
