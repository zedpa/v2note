/**
 * Digest Level 1 — core pipeline.
 * Decomposes records into Strikes, creates internal Bonds,
 * then links new Strikes to historical ones via cross-record Bonds.
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import {
  strikeRepo,
  bondRepo,
  strikeTagRepo,
  recordRepo,
  transcriptRepo,
  summaryRepo,
} from "../db/repositories/index.js";
import { buildDigestPrompt, buildCrossLinkPrompt } from "./digest-prompt.js";
import { projectIntendStrike } from "../cognitive/todo-projector.js";
import { linkNewStrikesToGoals } from "../cognitive/goal-auto-link.js";
import { getSession } from "../session/manager.js";
import { updateSoul } from "../soul/manager.js";
import { updateProfile } from "../profile/manager.js";
import { maySoulUpdate, mayProfileUpdate } from "../lib/text-utils.js";

// ── 聚类+涌现节流：同一用户 10 分钟内最多触发一次 ──
const lastClusteringRun = new Map<string, number>();
const CLUSTERING_THROTTLE_MS = 10 * 60 * 1000; // 10 分钟
const MIN_STRIKES_FOR_CLUSTERING = 3; // 至少产生 3 个新 Strike 才触发

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

interface RawCrossBond {
  new_idx: number;
  history_id: string;
  type: string;
  strength: number;
}

interface RawSupersede {
  new_idx: number;
  history_id: string;
}

/**
 * Main digest entry point.
 * Processes a batch of records through the full cognitive pipeline.
 */
export async function digestRecords(
  recordIds: string[],
  context: { deviceId: string; userId?: string },
): Promise<void> {
  const userId = context.userId ?? context.deviceId;

  try {
    // ── Step 1: Load records & text ──────────────────────────────
    const records = await Promise.all(
      recordIds.map((id) => recordRepo.findById(id)),
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

    // ── Step 2: AI decomposition (1st call) ──────────────────────
    const digestMessages: ChatMessage[] = [
      { role: "system", content: buildDigestPrompt() },
      { role: "user", content: combinedText },
    ];

    const digestResp = await chatCompletion(digestMessages, {
      json: true,
      temperature: 0.3,
    });

    let rawStrikes: RawStrike[];
    let rawBonds: RawBond[];
    try {
      const parsed = JSON.parse(digestResp.content);
      rawStrikes = parsed.strikes ?? [];
      rawBonds = parsed.bonds ?? [];
    } catch (e) {
      console.error("[digest] Failed to parse AI response as JSON:", e);
      return; // don't mark as digested
    }

    if (rawStrikes.length === 0) {
      console.log("[digest] AI returned no strikes, skipping");
      await markAllDigested(validIds);
      return;
    }

    // ── Step 3: Write Strikes to DB ──────────────────────────────
    const idxToId = new Map<number, string>();

    for (let i = 0; i < rawStrikes.length; i++) {
      const s = rawStrikes[i];
      try {
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

        // Write tags
        if (s.tags && s.tags.length > 0) {
          await strikeTagRepo.createMany(
            s.tags.map((label) => ({
              strike_id: entry.id,
              label,
            })),
          );
        }

        // intend Strike 自动投影为 todo/goal
        if (s.polarity === "intend") {
          try {
            await projectIntendStrike(entry, userId);
          } catch (e) {
            console.error(`[digest] Failed to project intend strike ${entry.id} to todo:`, e);
          }
        }
      } catch (e) {
        console.error(`[digest] Failed to write strike ${i}:`, e);
      }
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

    // ── Step 5: Retrieve historical Strikes ──────────────────────
    let historyStrikes: Awaited<ReturnType<typeof strikeRepo.findActive>> = [];

    try {
      // Try hybrid retrieval if CE-03 module exists
      const retrieval = await import("../cognitive/retrieval.js").catch(
        () => null,
      );
      if (retrieval?.hybridRetrieve) {
        const allTags = rawStrikes.flatMap((s) => s.tags ?? []);
        const combinedNucleus = rawStrikes.map((s) => s.nucleus).join("\n");
        const results = await retrieval.hybridRetrieve(
          combinedNucleus,
          allTags,
          userId,
          { limit: 20 },
        );
        historyStrikes = results.map(
          (r: { strike: (typeof historyStrikes)[number] }) => r.strike,
        );
      } else {
        historyStrikes = await strikeRepo.findActive(userId, 20);
      }
    } catch {
      historyStrikes = await strikeRepo.findActive(userId, 20);
    }

    // Exclude strikes we just created
    const newIds = new Set(idxToId.values());
    historyStrikes = historyStrikes.filter((s) => !newIds.has(s.id));

    // ── Step 6: Cross-record Bonds (2nd AI call) ─────────────────
    if (historyStrikes.length > 0) {
      try {
        const newStrikesList = rawStrikes.map((s, i) => ({
          idx: i,
          nucleus: s.nucleus,
          polarity: s.polarity,
        }));

        const historyList = historyStrikes.map((s) => ({
          id: s.id,
          nucleus: s.nucleus,
          polarity: s.polarity,
        }));

        const crossMessages: ChatMessage[] = [
          { role: "system", content: buildCrossLinkPrompt() },
          {
            role: "user",
            content: `新 Strike：\n${JSON.stringify(newStrikesList, null, 2)}\n\n历史 Strike：\n${JSON.stringify(historyList, null, 2)}`,
          },
        ];

        const crossResp = await chatCompletion(crossMessages, {
          json: true,
          temperature: 0.3,
        });

        let crossBonds: RawCrossBond[] = [];
        let supersedes: RawSupersede[] = [];
        try {
          const parsed = JSON.parse(crossResp.content);
          crossBonds = parsed.cross_bonds ?? [];
          supersedes = parsed.supersedes ?? [];
        } catch (e) {
          console.error("[digest] Failed to parse cross-link JSON:", e);
        }

        // Write cross bonds
        const crossToInsert = crossBonds
          .filter((b) => idxToId.has(b.new_idx))
          .map((b) => ({
            source_strike_id: idxToId.get(b.new_idx)!,
            target_strike_id: b.history_id,
            type: b.type,
            strength: b.strength ?? 0.5,
            created_by: "digest-cross",
          }));

        if (crossToInsert.length > 0) {
          await bondRepo.createMany(crossToInsert);
        }

        // Handle supersedes
        for (const sup of supersedes) {
          const newId = idxToId.get(sup.new_idx);
          if (newId) {
            try {
              await strikeRepo.updateStatus(
                sup.history_id,
                "superseded",
                newId,
              );
            } catch (e) {
              console.error(
                `[digest] Failed to supersede ${sup.history_id}:`,
                e,
              );
            }
          }
        }
      } catch (e) {
        console.error("[digest] Cross-link phase failed:", e);
        // Internal bonds are still preserved
      }
    }

    // ── Step 6.5: 新 Strike 自动关联已有目标 ─────────────────────
    try {
      const newStrikesForGoalLink = Array.from(idxToId.entries()).map(([_idx, id]) => ({
        id,
        source_id: validIds[0] ?? null,
      }));
      await linkNewStrikesToGoals(newStrikesForGoalLink, userId);
    } catch (e) {
      console.error("[digest] Goal auto-link failed:", e);
    }

    // ── Step 7: Mark records as digested ─────────────────────────
    await markAllDigested(validIds);

    // ── Step 8: 记忆/Soul/Profile 更新（Mem0 两阶段） ──────────
    // 在 Digest 完成后，异步更新长期记忆和用户画像
    try {
      const today = new Date().toISOString().split("T")[0];
      const session = getSession(context.deviceId);
      const memoryManager = session.memoryManager;

      // 8a. 记忆提取（每条记录都提取，异步不阻塞）
      memoryManager
        .maybeCreateMemory(context.deviceId, combinedText, today, context.userId)
        .catch((e) => console.warn("[digest] Memory creation failed:", e.message));

      // 8b. Soul 更新（关键词预过滤，避免不必要的 AI 调用）
      if (maySoulUpdate(combinedText)) {
        updateSoul(context.deviceId, combinedText, context.userId).catch((e) =>
          console.warn("[digest] Soul update failed:", e.message),
        );
      }

      // 8c. Profile 更新（关键词预过滤）
      if (mayProfileUpdate(combinedText)) {
        updateProfile(context.deviceId, combinedText, context.userId).catch((e) =>
          console.warn("[digest] Profile update failed:", e.message),
        );
      }
    } catch (e) {
      console.warn("[digest] Memory/soul/profile step failed:", e);
    }

    // ── Step 9: 聚类+涌现（节流触发） ──────────────────────────
    // 当新 Strike 数量足够且距上次聚类超过 10 分钟时，异步运行聚类+涌现
    if (idxToId.size >= MIN_STRIKES_FOR_CLUSTERING) {
      const lastRun = lastClusteringRun.get(userId) ?? 0;
      const now = Date.now();
      if (now - lastRun > CLUSTERING_THROTTLE_MS) {
        lastClusteringRun.set(userId, now);
        // 异步执行，不阻塞 digest 返回
        triggerClusteringAndEmergence(userId).catch((e) =>
          console.warn("[digest] Async clustering/emergence failed:", e.message),
        );
      }
    }
  } catch (e) {
    console.error("[digest] Pipeline failed:", e);
    // Don't rethrow — digest failure should not crash the caller
  }
}

/**
 * 异步触发聚类 + 涌现检查（轻量版 daily-cycle，只做聚类和涌现）
 */
async function triggerClusteringAndEmergence(userId: string): Promise<void> {
  console.log(`[digest] Triggering async clustering + emergence for user ${userId}`);

  try {
    const { runClustering } = await import("../cognitive/clustering.js");
    const clusterResult = await runClustering(userId);
    console.log(`[digest] Clustering: new=${clusterResult.newClusters} updated=${clusterResult.updatedClusters}`);

    // 有新聚类或更新时才做涌现检查
    if (clusterResult.newClusters > 0 || clusterResult.updatedClusters > 0) {
      const { runEmergence } = await import("../cognitive/emergence.js");
      const emergenceResult = await runEmergence(userId);
      console.log(`[digest] Emergence: higherOrder=${emergenceResult.higherOrderClusters} goals=${emergenceResult.goalEmergence}`);
    }
  } catch (e) {
    console.error("[digest] Clustering/emergence failed:", e);
  }
}

async function markAllDigested(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      recordRepo.markDigested(id).catch((e: unknown) => {
        console.error(`[digest] Failed to mark record ${id} as digested:`, e);
      }),
    ),
  );
}
