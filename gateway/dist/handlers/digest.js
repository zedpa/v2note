/**
 * Digest Tier1 — 实时 Strike 分解
 *
 * 每条记录 1 次 AI 调用：分解为 Strike + 内部 Bond。
 * 跨 Strike 关系由 Tier2 批量分析统一处理。
 */
import { chatCompletion } from "../ai/provider.js";
import { strikeRepo, bondRepo, strikeTagRepo, recordRepo, transcriptRepo, summaryRepo, snapshotRepo, } from "../db/repositories/index.js";
import { buildDigestPrompt } from "./digest-prompt.js";
import { projectIntendStrike } from "../cognitive/todo-projector.js";
import { linkNewStrikesToGoals } from "../cognitive/goal-auto-link.js";
import { getSession } from "../session/manager.js";
import { updateSoul } from "../soul/manager.js";
import { updateProfile } from "../profile/manager.js";
import { maySoulUpdate, mayProfileUpdate } from "../lib/text-utils.js";
import { TIER2_STRIKE_THRESHOLD } from "../cognitive/batch-analyze.js";
/**
 * Main digest entry point.
 * Tier1: 1 次 AI 调用分解 Strike + 内部 Bond。
 */
export async function digestRecords(recordIds, context) {
    const userId = context.userId ?? context.deviceId;
    try {
        // ── Step 0: 原子抢占 — 防止并发 digest 同一 record ────────
        const claimedIds = await recordRepo.claimForDigest(recordIds);
        if (claimedIds.length === 0) {
            console.log("[digest] All records already claimed, skipping");
            return;
        }
        if (claimedIds.length < recordIds.length) {
            console.log(`[digest] Claimed ${claimedIds.length}/${recordIds.length} records (rest already digested)`);
        }
        // ── Step 1: Load records & text ──────────────────────────────
        const records = await Promise.all(claimedIds.map((id) => recordRepo.findById(id)));
        const validIds = records
            .filter((r) => r !== null)
            .map((r) => r.id);
        // Build sourceType mapping: material stays material, everything else → think
        const sourceTypeMap = new Map();
        for (const r of records.filter(Boolean)) {
            sourceTypeMap.set(r.id, r.source_type === "material" ? "material" : "think");
        }
        if (validIds.length === 0) {
            console.warn("[digest] No valid records found for ids:", recordIds);
            return;
        }
        const transcripts = await transcriptRepo.findByRecordIds(validIds);
        const summaries = await Promise.all(validIds.map((id) => summaryRepo.findByRecordId(id)));
        // Build id → text map: prefer summary, fallback to transcript
        const summaryByRecord = new Map(summaries.filter(Boolean).map((s) => [s.record_id, s.short_summary || s.long_summary]));
        const transcriptByRecord = new Map(transcripts.map((t) => [t.record_id, t.text]));
        const textParts = [];
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
        // ── Step 2: AI decomposition (1 次调用) ─────────────────────
        const digestMessages = [
            { role: "system", content: buildDigestPrompt() },
            { role: "user", content: combinedText },
        ];
        const digestResp = await chatCompletion(digestMessages, {
            json: true,
            temperature: 0.3,
        });
        let rawStrikes;
        let rawBonds;
        try {
            const parsed = JSON.parse(digestResp.content);
            rawStrikes = parsed.strikes ?? [];
            rawBonds = parsed.bonds ?? [];
        }
        catch (e) {
            console.error("[digest] Failed to parse AI response as JSON:", e);
            // 回滚：解析失败时恢复 digested 状态，允许重试
            await unclaimRecords(claimedIds);
            return;
        }
        if (rawStrikes.length === 0) {
            console.log("[digest] AI returned no strikes, skipping");
            // record 已在 Step 0 被 claimForDigest 标记为 digested
            return;
        }
        // ── Step 3: Write Strikes to DB（含去重）─────────────────────
        const idxToId = new Map();
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
                // Write tags
                if (s.tags && s.tags.length > 0) {
                    await strikeTagRepo.createMany(s.tags.map((label) => ({
                        strike_id: entry.id,
                        label,
                    })));
                }
                // intend Strike 自动投影为 todo/goal
                if (s.polarity === "intend") {
                    try {
                        await projectIntendStrike(entry, userId);
                    }
                    catch (e) {
                        console.error(`[digest] Failed to project intend strike ${entry.id} to todo:`, e);
                    }
                }
            }
            catch (e) {
                console.error(`[digest] Failed to write strike ${i}:`, e);
            }
        }
        // ── Step 4: Write internal Bonds ─────────────────────────────
        const bondsToInsert = rawBonds
            .filter((b) => idxToId.has(b.source_idx) && idxToId.has(b.target_idx))
            .map((b) => ({
            source_strike_id: idxToId.get(b.source_idx),
            target_strike_id: idxToId.get(b.target_idx),
            type: b.type,
            strength: b.strength ?? 0.5,
            created_by: "digest",
        }));
        if (bondsToInsert.length > 0) {
            try {
                await bondRepo.createMany(bondsToInsert);
            }
            catch (e) {
                console.error("[digest] Failed to write internal bonds:", e);
            }
        }
        // ── Step 5: 新 Strike 自动关联已有目标 ─────────────────────
        try {
            const newStrikesForGoalLink = Array.from(idxToId.entries()).map(([_idx, id]) => ({
                id,
                source_id: validIds[0] ?? null,
            }));
            await linkNewStrikesToGoals(newStrikesForGoalLink, userId);
        }
        catch (e) {
            console.error("[digest] Goal auto-link failed:", e);
        }
        // Step 6 已移除：record 在 Step 0 由 claimForDigest 原子标记
        // ── Step 7: 记忆/Soul/Profile 更新（Mem0 两阶段） ──────────
        try {
            const today = new Date().toISOString().split("T")[0];
            const session = getSession(context.deviceId);
            const memoryManager = session.memoryManager;
            memoryManager
                .maybeCreateMemory(context.deviceId, combinedText, today, context.userId)
                .catch((e) => console.warn("[digest] Memory creation failed:", e.message));
            if (maySoulUpdate(combinedText)) {
                updateSoul(context.deviceId, combinedText, context.userId).catch((e) => console.warn("[digest] Soul update failed:", e.message));
            }
            if (mayProfileUpdate(combinedText)) {
                updateProfile(context.deviceId, combinedText, context.userId).catch((e) => console.warn("[digest] Profile update failed:", e.message));
            }
        }
        catch (e) {
            console.warn("[digest] Memory/soul/profile step failed:", e);
        }
        // ── Step 8: 检查是否触发 Tier2 批量分析 ─────────────────────
        try {
            const newCount = await snapshotRepo.countNewStrikes(userId);
            if (newCount >= TIER2_STRIKE_THRESHOLD) {
                const { runBatchAnalyze } = await import("../cognitive/batch-analyze.js");
                runBatchAnalyze(userId).catch((e) => console.warn("[digest] Tier2 batch-analyze failed:", e.message));
            }
        }
        catch (e) {
            console.warn("[digest] Tier2 trigger check failed:", e);
        }
    }
    catch (e) {
        console.error("[digest] Pipeline failed:", e);
        // 回滚：管道失败时恢复 digested 状态，允许重试
        await unclaimRecords(recordIds);
    }
}
/** 回滚：digest 失败时恢复 digested=false，允许下次重试 */
async function unclaimRecords(ids) {
    await Promise.all(ids.map((id) => recordRepo.unclaimDigest(id).catch((e) => {
        console.error(`[digest] Failed to unclaim record ${id}:`, e);
    })));
}
//# sourceMappingURL=digest.js.map