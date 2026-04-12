/**
 * Ingest Pipeline（Phase 2 — 认知 Wiki）
 *
 * 简化后的 digest 流程：
 * - 1 次 AI 调用提取 intend（待办/目标），不再拆解 Strike/Bond
 * - 生成 content_hash（SHA256）
 * - Record 标记为 pending_compile（等待每日 Wiki 编译）
 * - 保留 Memory/Soul/Profile 更新
 */

import crypto from "crypto";
import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import {
  recordRepo,
  transcriptRepo,
  summaryRepo,
} from "../db/repositories/index.js";
import { buildIngestPrompt } from "./digest-prompt.js";
import { projectIntendStrike, type IntendInput } from "../cognitive/todo-projector.js";
import { getSession } from "../session/manager.js";
import { updateSoul } from "../soul/manager.js";
import { updateProfile } from "../profile/manager.js";
import { mayProfileUpdate, safeParseJson } from "../lib/text-utils.js";
import { shouldUpdateSoulStrict } from "../cognitive/self-evolution.js";
import { today as tzToday, now as tzNow } from "../lib/tz.js";
import { processAtRoute } from "../cognitive/at-route-parser.js";
import { classifyRecord } from "../cognitive/lightweight-classifier.js";

/** AI 返回的 intend 数据结构（Phase 14.2: granularity 已移除，只提取 action） */
interface RawIntend {
  text: string;
  scheduled_start?: string;
  deadline?: string;
  person?: string;
  priority?: "high" | "medium" | "low";
}

/** AI 返回的完整 JSON 结构 */
interface IngestResult {
  intends?: RawIntend[];
}

/**
 * Main digest entry point.
 * Phase 2: 只提取 intend + 标记 pending_compile，不再拆解 Strike/Bond。
 */
export async function digestRecords(
  recordIds: string[],
  context: { deviceId: string; userId?: string },
): Promise<void> {
  // userId 必须是 app_user.id；如果未传入，从 record/device 表查找
  let userId = context.userId;
  if (!userId) {
    const rec = recordIds[0] ? await recordRepo.findById(recordIds[0]) : null;
    userId = rec?.user_id ?? undefined;
    if (!userId) {
      // 从 device 表查找关联的 user_id
      const { queryOne: qo } = await import("../db/pool.js");
      const dev = await qo<{ user_id: string | null }>(
        `SELECT user_id FROM device WHERE id = $1`, [context.deviceId],
      ).catch(() => null);
      userId = dev?.user_id ?? undefined;
    }
    if (!userId) {
      console.warn(`[digest] No userId for device ${context.deviceId}, skipping digest`);
      return;
    }
  }

  try {
    const dt0 = Date.now();
    // ── Step 0: 原子抢占 — 防止并发 digest 同一 record ────────
    const claimedIds = await recordRepo.claimForDigest(recordIds);
    console.log(`[digest][⏱ claim] ${Date.now() - dt0}ms — claimed ${claimedIds.length}/${recordIds.length}`);
    if (claimedIds.length === 0) {
      console.log("[digest] All records already claimed, skipping");
      return;
    }
    if (claimedIds.length < recordIds.length) {
      console.log(`[digest] Claimed ${claimedIds.length}/${recordIds.length} records (rest already digested)`);
    }

    // ── Step 1: Load records & text ──────────────────────────────
    const records = await Promise.all(
      claimedIds.map((id) => recordRepo.findById(id)),
    );
    const validIds = records
      .filter((r) => r !== null)
      .map((r) => r!.id);

    if (validIds.length === 0) {
      console.warn("[digest] No valid records found for ids:", recordIds);
      return;
    }

    const transcripts = await transcriptRepo.findByRecordIds(validIds);
    const summaries = await Promise.all(
      validIds.map((id) => summaryRepo.findByRecordId(id)),
    );

    // Build id → text map: prefer summary, fallback to transcript
    const summaryByRecord = new Map(
      summaries.filter(Boolean).map((s) => [s!.record_id, s!.short_summary || s!.long_summary]),
    );
    const transcriptByRecord = new Map(
      transcripts.map((t) => [t.record_id, t.text]),
    );

    const textParts: string[] = [];
    for (const id of validIds) {
      const text = summaryByRecord.get(id) ?? transcriptByRecord.get(id);
      if (text) {
        textParts.push(validIds.length > 1 ? `[记录 ${id}]\n${text}` : text);
      }
    }

    if (textParts.length === 0) {
      console.warn("[digest] No text content for records:", validIds);
      return;
    }

    const combinedText = textParts.join("\n\n---\n\n");
    console.log(`[digest][⏱ load-text] ${Date.now() - dt0}ms — text: ${combinedText.length} chars`);

    // ── Step 1.5: @路由解析（确定性预抽取）───────────────────
    // 解析 @domain/subdomain 语法，自动创建 page 并建立关联
    const atRouteResults = new Map<string, boolean>(); // recordId → 是否有 @路由
    for (const id of validIds) {
      const text = summaryByRecord.get(id) ?? transcriptByRecord.get(id);
      if (text) {
        try {
          const result = await processAtRoute(userId!, id, text);
          atRouteResults.set(id, result !== null);
          if (result) {
            // 将 target_path 写入 record.metadata
            await recordRepo.mergeMetadata(id, { target_path: result.targetPath });
            console.log(`[digest] @路由命中: record=${id} → page=${result.pageId} (${result.targetPath})`);
          }
        } catch (e) {
          console.warn(`[digest] @路由解析失败 for record ${id}:`, e);
          atRouteResults.set(id, false);
        }
      }
    }

    // ── Step 1.6: 轻量分类（无 @路由的 Record 异步 AI 分类）───
    // Fire-and-forget：不阻塞主流程，失败静默忽略
    for (const id of validIds) {
      if (!atRouteResults.get(id)) {
        const text = summaryByRecord.get(id) ?? transcriptByRecord.get(id);
        if (text) {
          classifyRecord(id, text, userId!).catch((e) =>
            console.warn(`[digest] 轻量分类失败 for record ${id}:`, e),
          );
        }
      }
    }

    // ── Step 2: AI 调用 — 只提取 intend（1 次调用）─────────────
    const ingestMessages: ChatMessage[] = [
      { role: "system", content: buildIngestPrompt() },
      { role: "user", content: combinedText },
    ];

    const dtAi = Date.now();
    const aiResp = await chatCompletion(ingestMessages, {
      json: true,
      temperature: 0.3,
      tier: "fast",
    });
    console.log(`[digest][⏱ ai-call] ${Date.now() - dtAi}ms — response: ${aiResp.content.length} chars`);

    const parsed = safeParseJson<IngestResult>(aiResp.content);
    if (!parsed) {
      console.error("[digest] Failed to parse AI response as JSON:", aiResp.content.slice(0, 300));
      await unclaimRecords(claimedIds);
      return;
    }

    const intends = parsed.intends ?? [];

    // ── Step 3: intend 投影为 todo/goal ────────────────────────
    if (intends.length > 0) {
      const dtProj = Date.now();
      await Promise.all(
        intends.map((intend) => {
          const input: IntendInput = {
            user_id: userId!,
            nucleus: intend.text,
            polarity: "intend",
            source_id: validIds[0],
            field: {
              scheduled_start: intend.scheduled_start,
              deadline: intend.deadline,
              person: intend.person,
              priority: intend.priority,
            },
          };

          return projectIntendStrike(input, userId!).catch((e) =>
            console.error(`[digest] Failed to project intend "${intend.text.slice(0, 30)}" to todo:`, e),
          );
        }),
      );
      console.log(`[digest][⏱ project-intend] ${Date.now() - dtProj}ms — ${intends.length} items`);
    }

    // ── Step 5: 生成 content_hash + 标记 pending_compile ─────────
    for (const id of validIds) {
      const text = summaryByRecord.get(id) ?? transcriptByRecord.get(id) ?? "";
      const contentHash = crypto.createHash("sha256").update(text).digest("hex");
      await recordRepo.updateCompileStatus(id, "pending", contentHash).catch((e) =>
        console.warn(`[digest] Failed to update compile status for ${id}:`, e),
      );
    }

    // ── Step 6: 记忆/Soul/Profile 更新 ──────────────────────────
    try {
      const today = tzToday();
      const session = getSession(userId!);
      const memoryManager = session.memoryManager;

      memoryManager
        .maybeCreateMemory(userId!, combinedText, today, userId)
        .catch((e: any) => console.warn("[digest] Memory creation failed:", e.message));

      if (shouldUpdateSoulStrict([combinedText])) {
        updateSoul(userId!, combinedText, userId).catch((e: any) =>
          console.warn("[digest] Soul update failed:", e.message),
        );
      }

      if (mayProfileUpdate(combinedText)) {
        updateProfile(userId!, combinedText, userId).catch((e: any) =>
          console.warn("[digest] Profile update failed:", e.message),
        );
      }
    } catch (e) {
      console.warn("[digest] Memory/soul/profile step failed:", e);
    }

    console.log(`[digest][⏱ total] ${Date.now() - dt0}ms — pipeline done for ${claimedIds.length} records`);
  } catch (e) {
    console.error("[digest] Pipeline failed:", e);
    // 回滚：管道失败时恢复 digested 状态，允许重试
    await unclaimRecords(recordIds);
  }
}

/** 回滚：digest 失败时恢复 digested=false，允许下次重试 */
async function unclaimRecords(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      recordRepo.unclaimDigest(id).catch((e: unknown) => {
        console.error(`[digest] Failed to unclaim record ${id}:`, e);
      }),
    ),
  );
}
