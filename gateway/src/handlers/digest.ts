/**
 * Digest Tier1 — 实时 Strike 分解
 *
 * 每条记录 1 次 AI 调用：分解为 Strike + 内部 Bond。
 * 跨 Strike 关系由 Tier2 批量分析统一处理。
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import {
  strikeRepo,
  bondRepo,
  strikeTagRepo,
  tagRepo,
  recordRepo,
  transcriptRepo,
  summaryRepo,
  snapshotRepo,
} from "../db/repositories/index.js";
import { buildDigestPrompt } from "./digest-prompt.js";
import { projectIntendStrike } from "../cognitive/todo-projector.js";
import { linkNewStrikesToGoals } from "../cognitive/goal-auto-link.js";
import { getSession } from "../session/manager.js";
import { updateSoul } from "../soul/manager.js";
import { updateProfile } from "../profile/manager.js";
import { mayProfileUpdate, safeParseJson } from "../lib/text-utils.js";
import { shouldUpdateSoulStrict } from "../cognitive/self-evolution.js";
import { TIER2_STRIKE_THRESHOLD } from "../cognitive/batch-analyze.js";
import { writeStrikeEmbedding } from "../cognitive/embed-writer.js";

interface RawStrike {
  nucleus: string;
  polarity: string;
  confidence: number;
  tags: string[];
  field?: Record<string, any>;
}

interface RawBond {
  source_idx: number;
  target_idx: number;
  type: string;
  strength: number;
}

/**
 * Main digest entry point.
 * Tier1: 1 次 AI 调用分解 Strike + 内部 Bond。
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

    // Build sourceType mapping: material stays material, everything else → think
    const sourceTypeMap = new Map<string, string>();
    for (const r of records.filter(Boolean)) {
      sourceTypeMap.set(r!.id, r!.source_type === "material" ? "material" : "think");
    }

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

    // ── Step 1.5: 查询用户已有 domain 列表（供 AI 保持分类一致性）──
    const existingDomains = await recordRepo.listUserDomains(userId).catch(() => [] as string[]);

    // ── Step 2: AI decomposition (1 次调用) ─────────────────────
    const digestMessages: ChatMessage[] = [
      { role: "system", content: buildDigestPrompt(existingDomains) },
      { role: "user", content: combinedText },
    ];

    const dtAi = Date.now();
    const digestResp = await chatCompletion(digestMessages, {
      json: true,
      temperature: 0.3,
      tier: "fast",
    });
    console.log(`[digest][⏱ ai-call] ${Date.now() - dtAi}ms — response: ${digestResp.content.length} chars`);

    let rawStrikes: RawStrike[];
    let rawBonds: RawBond[];
    const parsed = safeParseJson<{ strikes?: RawStrike[]; bonds?: RawBond[]; domain?: string | null }>(digestResp.content);
    if (!parsed) {
      console.error("[digest] Failed to parse AI response as JSON:", digestResp.content.slice(0, 300));
      await unclaimRecords(claimedIds);
      return;
    }
    rawStrikes = parsed.strikes ?? [];
    rawBonds = parsed.bonds ?? [];

    // ── 写入 record.domain（自动归类）──
    const recordDomain = parsed.domain ?? null;
    if (recordDomain && validIds[0]) {
      await recordRepo.updateDomain(validIds[0], recordDomain).catch((e) =>
        console.warn("[digest] Failed to update record domain:", e),
      );
    }

    if (rawStrikes.length === 0) {
      console.log("[digest] AI returned no strikes, skipping");
      // record 已在 Step 0 被 claimForDigest 标记为 digested
      return;
    }

    // ── Step 3: Write Strikes to DB（含去重）─────────────────────
    const idxToId = new Map<number, string>();
    const intendEntries: { entry: Awaited<ReturnType<typeof strikeRepo.create>>; idx: number }[] = [];

    for (let i = 0; i < rawStrikes.length; i++) {
      const s = rawStrikes[i];
      try {
        // Strike 去重：同一 source_id + 相同 nucleus → 跳过
        if (validIds[0] && await strikeRepo.existsBySourceAndNucleus(validIds[0], s.nucleus)) {
          console.log(`[digest] Skipping duplicate strike: "${s.nucleus.slice(0, 30)}..."`);
          continue;
        }

        const strikeSourceType = sourceTypeMap.get(validIds[0]) ?? "think";
        const entry = await strikeRepo.create({
          user_id: userId,
          nucleus: s.nucleus,
          polarity: s.polarity,
          field: s.field,
          confidence: s.confidence ?? 0.5,
          salience: strikeSourceType === "material" ? 0.2 : undefined,
          source_id: validIds[0],
          source_type: strikeSourceType,
        });
        idxToId.set(i, entry.id);

        // 异步写入 embedding（不阻塞主流程）
        void writeStrikeEmbedding(entry.id, s.nucleus);

        // Write tags to strike_tag + record_tag（标签立刻在前端可见）
        if (s.tags && s.tags.length > 0) {
          await strikeTagRepo.createMany(
            s.tags.map((label) => ({
              strike_id: entry.id,
              label,
            })),
          );
          // 同步写 record_tag，让时间线立刻展示标签
          if (validIds[0]) {
            for (const label of s.tags) {
              try {
                const tag = await tagRepo.upsert(label);
                await tagRepo.addToRecord(validIds[0], tag.id);
              } catch (_e) {
                // record_tag 写入失败不阻塞主流程
              }
            }
          }
        }

        // 收集 intend Strike，后面并行投影
        if (s.polarity === "intend") {
          intendEntries.push({ entry, idx: i });
        }
      } catch (e) {
        console.error(`[digest] Failed to write strike ${i}:`, e);
      }
    }

    console.log(`[digest][⏱ write-strikes] ${Date.now() - dt0}ms — ${idxToId.size} strikes, ${intendEntries.length} intend`);

    // intend Strike 并行投影为 todo/goal
    if (intendEntries.length > 0) {
      const dtProj = Date.now();
      await Promise.all(
        intendEntries.map(({ entry }) =>
          projectIntendStrike(entry, userId).catch((e) =>
            console.error(`[digest] Failed to project intend strike ${entry.id} to todo:`, e),
          ),
        ),
      );
      console.log(`[digest][⏱ project-intend] ${Date.now() - dtProj}ms — ${intendEntries.length} items`);
    }

    // ── Step 4: Write internal Bonds ─────────────────────────────
    const bondsToInsert = rawBonds
      .filter((b) => idxToId.has(b.source_idx) && idxToId.has(b.target_idx))
      .map((b) => ({
        source_strike_id: idxToId.get(b.source_idx)!,
        target_strike_id: idxToId.get(b.target_idx)!,
        type: b.type,
        strength: b.strength ?? 0.5,
        created_by: "digest",
      }));

    if (bondsToInsert.length > 0) {
      try {
        await bondRepo.createMany(bondsToInsert);
      } catch (e) {
        console.error("[digest] Failed to write internal bonds:", e);
      }
    }

    // ── Step 5: 新 Strike 自动关联已有目标 ─────────────────────
    const dtGoalLink = Date.now();
    try {
      const newStrikesForGoalLink = Array.from(idxToId.entries()).map(([_idx, id]) => ({
        id,
        source_id: validIds[0] ?? null,
      }));
      await linkNewStrikesToGoals(newStrikesForGoalLink, userId);
    } catch (e) {
      console.error("[digest] Goal auto-link failed:", e);
    }
    console.log(`[digest][⏱ goal-link] ${Date.now() - dtGoalLink}ms`);

    // Step 6 已移除：record 在 Step 0 由 claimForDigest 原子标记

    // ── Step 7: 记忆/Soul/Profile 更新（Mem0 两阶段） ──────────
    try {
      const today = new Date().toISOString().split("T")[0];
      const session = getSession(context.deviceId);
      const memoryManager = session.memoryManager;

      memoryManager
        .maybeCreateMemory(context.deviceId, combinedText, today, context.userId)
        .catch((e) => console.warn("[digest] Memory creation failed:", e.message));

      if (shouldUpdateSoulStrict([combinedText])) {
        updateSoul(context.deviceId, combinedText, context.userId).catch((e) =>
          console.warn("[digest] Soul update failed:", e.message),
        );
      }

      if (mayProfileUpdate(combinedText)) {
        updateProfile(context.deviceId, combinedText, context.userId).catch((e) =>
          console.warn("[digest] Profile update failed:", e.message),
        );
      }
    } catch (e) {
      console.warn("[digest] Memory/soul/profile step failed:", e);
    }

    // ── Step 8: 检查是否触发 Tier2 批量分析 ─────────────────────
    try {
      const newCount = await snapshotRepo.countNewStrikes(userId);
      // 冷启动加速：总 Strike < 20 时阈值降为 2，让新用户尽快看到聚类
      const totalStrikes = await snapshotRepo.countTotalStrikes(userId);
      const threshold = totalStrikes < 20 ? 2 : TIER2_STRIKE_THRESHOLD;
      if (newCount >= threshold) {
        console.log(`[digest][⏱ tier2-trigger] newStrikes=${newCount} >= ${threshold} (total=${totalStrikes}, coldStart=${totalStrikes < 20}), launching batch-analyze`);
        const { runBatchAnalyze } = await import("../cognitive/batch-analyze.js");
        runBatchAnalyze(userId).catch((e) =>
          console.warn("[digest] Tier2 batch-analyze failed:", e.message),
        );
      }
    } catch (e) {
      console.warn("[digest] Tier2 trigger check failed:", e);
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
