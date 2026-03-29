/**
 * Tier2 批量分析引擎 — 单次 AI 调用替代多步管线
 *
 * 触发条件（OR 逻辑）：
 * - 累计 5 个新 Strike（digest 后检查）
 * - 每日 3AM 定时触发
 *
 * 替代：clustering + emergence + contradiction + promote + tag-sync
 */
import { chatCompletion } from "../ai/provider.js";
import { strikeRepo, bondRepo, strikeTagRepo, todoRepo, snapshotRepo, } from "../db/repositories/index.js";
import { queryOne } from "../db/pool.js";
import { buildBatchAnalyzeMessages, toPromptStrikes, } from "./batch-analyze-prompt.js";
// ── 配置 ───────────────────────────────────────────────────────────────
export const TIER2_STRIKE_THRESHOLD = 5;
const MAX_STRIKES_PER_BATCH = 150;
const AI_TIMEOUT = 300_000; // 5 分钟（增量分析含 assign 到已有 Cluster 需要更长时间）
// ── 并发锁 ─────────────────────────────────────────────────────────────
const runningUsers = new Set();
// ── 主入口 ─────────────────────────────────────────────────────────────
export async function runBatchAnalyze(userId) {
    const empty = {
        success: false, strikeCount: 0, newClusters: 0, mergedClusters: 0,
        bonds: 0, contradictions: 0, patterns: 0, goals: 0, supersedes: 0,
    };
    // 并发保护
    if (runningUsers.has(userId)) {
        console.log("[batch-analyze] Skipped: already running for", userId);
        return empty;
    }
    runningUsers.add(userId);
    const t0 = Date.now();
    try {
        // 0. 获取用户的 deviceId（goal 表需要）
        const deviceRow = await queryOne(`SELECT id FROM device WHERE user_id = $1 LIMIT 1`, [userId]);
        const deviceId = deviceRow?.id ?? null;
        // 1. 读取 snapshot
        const snapshot = await snapshotRepo.findByUser(userId);
        // 2. 获取新 Strike
        const newStrikeRows = await snapshotRepo.getNewStrikes(userId, snapshot?.last_analyzed_strike_id ?? null, MAX_STRIKES_PER_BATCH);
        if (newStrikeRows.length === 0) {
            console.log("[batch-analyze] No new strikes, skipping");
            return empty;
        }
        console.log(`[batch-analyze] Analyzing ${newStrikeRows.length} new strikes for user ${userId}`);
        // 3. 获取用户 L3 维度列表（供 AI 为 Cluster 分配 domain）
        const userDimensions = await todoRepo.getDimensionSummary(userId);
        const dimensions = userDimensions
            .map((d) => d.domain)
            .filter((d) => d !== "其他");
        // 4. 构建 prompt 输入
        const input = {
            existing_structure: snapshot
                ? {
                    clusters: snapshot.clusters,
                    goals: snapshot.goals,
                    contradictions: snapshot.contradictions,
                    patterns: snapshot.patterns,
                }
                : null,
            new_strikes: toPromptStrikes(newStrikeRows),
            dimensions: dimensions.length > 0 ? dimensions : undefined,
        };
        const messages = buildBatchAnalyzeMessages(input);
        // 4. 单次 AI 调用
        const resp = await chatCompletion(messages, {
            json: true,
            temperature: 0.3,
            timeout: AI_TIMEOUT,
        });
        // 5. 解析输出
        let output;
        try {
            output = JSON.parse(resp.content);
        }
        catch (e) {
            console.error("[batch-analyze] Failed to parse AI JSON:", e);
            return empty;
        }
        // 6. 已知 ID 集合（用于验证 AI 输出）
        const knownStrikeIds = new Set(newStrikeRows.map((s) => s.id));
        const knownClusterIds = new Set((snapshot?.clusters ?? []).map((c) => c.id));
        // 新建的 cluster name → id 映射
        const newClusterNameToId = new Map();
        const result = {
            success: true, strikeCount: newStrikeRows.length,
            newClusters: 0, mergedClusters: 0, bonds: 0,
            contradictions: 0, patterns: 0, goals: 0, supersedes: 0,
        };
        // 收集新 snapshot 数据
        const snapshotClusters = [...(snapshot?.clusters ?? [])];
        const snapshotGoals = [...(snapshot?.goals ?? [])];
        // 7a. new_clusters — 先创建聚类（后续 assign 可能引用）
        for (const nc of output.new_clusters ?? []) {
            if (!nc.name || !nc.member_strike_ids?.length)
                continue;
            const validMembers = nc.member_strike_ids.filter((id) => knownStrikeIds.has(id));
            if (validMembers.length === 0)
                continue;
            try {
                const cluster = await strikeRepo.create({
                    user_id: userId,
                    nucleus: `[${nc.name}] ${nc.description ?? ""}`,
                    polarity: nc.polarity ?? "perceive",
                    is_cluster: true,
                    confidence: 0.7,
                    salience: 1.0,
                    source_type: "clustering",
                    level: 1,
                    origin: "emerged",
                });
                knownClusterIds.add(cluster.id);
                newClusterNameToId.set(nc.name, cluster.id);
                // 设置 Cluster 的 domain（L3 维度归属）
                if (nc.domain) {
                    await queryOne(`UPDATE strike SET domain = $1 WHERE id = $2`, [nc.domain, cluster.id]);
                }
                // 创建 cluster_member bonds
                await bondRepo.createMany(validMembers.map((id) => ({
                    source_strike_id: cluster.id,
                    target_strike_id: id,
                    type: "cluster_member",
                    strength: 1.0,
                    created_by: "batch-analyze",
                })));
                snapshotClusters.push({
                    id: cluster.id,
                    name: nc.name,
                    description: nc.description ?? "",
                    size: validMembers.length,
                    polarity: nc.polarity ?? "perceive",
                    level: 1,
                });
                result.newClusters++;
                console.log(`[batch-analyze] New cluster: "${nc.name}" (${validMembers.length} members)`);
            }
            catch (e) {
                console.error(`[batch-analyze] Failed to create cluster "${nc.name}":`, e);
            }
        }
        // 7b. assign — 将 Strike 归入已有聚类
        for (const a of output.assign ?? []) {
            if (!knownStrikeIds.has(a.strike_id) || !knownClusterIds.has(a.cluster_id))
                continue;
            try {
                await bondRepo.create({
                    source_strike_id: a.cluster_id,
                    target_strike_id: a.strike_id,
                    type: "cluster_member",
                    strength: 1.0,
                    created_by: "batch-analyze",
                });
                // 更新 snapshot 中该聚类的 size
                const sc = snapshotClusters.find((c) => c.id === a.cluster_id);
                if (sc)
                    sc.size++;
            }
            catch (e) {
                // 可能已存在，忽略
            }
        }
        // 7c. merge_clusters
        for (const mc of output.merge_clusters ?? []) {
            if (!knownClusterIds.has(mc.cluster_a_id) || !knownClusterIds.has(mc.cluster_b_id))
                continue;
            try {
                // 创建新合并聚类
                const merged = await strikeRepo.create({
                    user_id: userId,
                    nucleus: `[${mc.new_name}] ${mc.reason ?? ""}`,
                    polarity: "perceive",
                    is_cluster: true,
                    confidence: 0.7,
                    salience: 1.0,
                    source_type: "clustering",
                    level: 1,
                    origin: "emerged",
                });
                // 迁移旧聚类的成员到新聚类
                for (const oldClusterId of [mc.cluster_a_id, mc.cluster_b_id]) {
                    const members = await bondRepo.findByStrike(oldClusterId);
                    const memberIds = members
                        .filter((b) => b.type === "cluster_member" && b.source_strike_id === oldClusterId)
                        .map((b) => b.target_strike_id);
                    if (memberIds.length > 0) {
                        await bondRepo.createMany(memberIds.map((id) => ({
                            source_strike_id: merged.id,
                            target_strike_id: id,
                            type: "cluster_member",
                            strength: 1.0,
                            created_by: "batch-analyze",
                        })));
                    }
                    // 标记旧聚类为 merged
                    await strikeRepo.updateStatus(oldClusterId, "merged");
                    // 更新引用旧 cluster_id 的 todo(level>=1)
                    await todoRepo.updateClusterRef(oldClusterId, merged.id);
                }
                // 更新 snapshot
                const idxA = snapshotClusters.findIndex((c) => c.id === mc.cluster_a_id);
                const idxB = snapshotClusters.findIndex((c) => c.id === mc.cluster_b_id);
                const sizeA = idxA >= 0 ? snapshotClusters[idxA].size : 0;
                const sizeB = idxB >= 0 ? snapshotClusters[idxB].size : 0;
                // 删除旧的，添加新的
                const toRemove = new Set([mc.cluster_a_id, mc.cluster_b_id]);
                const filtered = snapshotClusters.filter((c) => !toRemove.has(c.id));
                snapshotClusters.length = 0;
                snapshotClusters.push(...filtered, {
                    id: merged.id,
                    name: mc.new_name,
                    description: mc.reason ?? "",
                    size: sizeA + sizeB,
                    polarity: "perceive",
                    level: 1,
                });
                knownClusterIds.add(merged.id);
                result.mergedClusters++;
                console.log(`[batch-analyze] Merged: "${mc.new_name}"`);
            }
            catch (e) {
                console.error(`[batch-analyze] Merge failed:`, e);
            }
        }
        // 7d. bonds
        const validBonds = (output.bonds ?? []).filter((b) => (knownStrikeIds.has(b.source_strike_id) || knownClusterIds.has(b.source_strike_id)) &&
            (knownStrikeIds.has(b.target_strike_id) || knownClusterIds.has(b.target_strike_id)));
        if (validBonds.length > 0) {
            try {
                await bondRepo.createMany(validBonds.map((b) => ({
                    source_strike_id: b.source_strike_id,
                    target_strike_id: b.target_strike_id,
                    type: b.type || "context_of",
                    strength: b.strength ?? 0.5,
                    created_by: "batch-analyze",
                })));
                result.bonds = validBonds.length;
            }
            catch (e) {
                console.error("[batch-analyze] Bonds creation failed:", e);
            }
        }
        // 7e. contradictions
        for (const c of output.contradictions ?? []) {
            if (!knownStrikeIds.has(c.strike_a_id) || !knownStrikeIds.has(c.strike_b_id))
                continue;
            try {
                await bondRepo.create({
                    source_strike_id: c.strike_a_id,
                    target_strike_id: c.strike_b_id,
                    type: "contradiction",
                    strength: c.severity === "high" ? 0.9 : c.severity === "medium" ? 0.7 : 0.5,
                    created_by: "batch-analyze",
                });
                result.contradictions++;
            }
            catch (e) {
                // 可能已存在
            }
        }
        // 7f. patterns
        for (const p of output.patterns ?? []) {
            if (!p.pattern || (p.confidence ?? 0) < 0.5)
                continue;
            try {
                const patternStrike = await strikeRepo.create({
                    user_id: userId,
                    nucleus: p.pattern,
                    polarity: "realize",
                    confidence: p.confidence,
                    source_type: "inference",
                });
                const validEvidence = (p.evidence_strike_ids ?? []).filter((id) => knownStrikeIds.has(id));
                if (validEvidence.length > 0) {
                    await bondRepo.createMany(validEvidence.map((id) => ({
                        source_strike_id: patternStrike.id,
                        target_strike_id: id,
                        type: "abstracted_from",
                        strength: 0.8,
                        created_by: "batch-analyze",
                    })));
                }
                result.patterns++;
                console.log(`[batch-analyze] Pattern: "${p.pattern}"`);
            }
            catch (e) {
                console.error("[batch-analyze] Pattern creation failed:", e);
            }
        }
        // 7g. goal_suggestions — 创建为 level=1 的 todo（统一模型）
        for (const gs of output.goal_suggestions ?? []) {
            if (!gs.title)
                continue;
            try {
                // 找到关联的 cluster_id（通过名称匹配 snapshot 或新建的聚类）
                let clusterId;
                if (gs.cluster_name) {
                    clusterId = newClusterNameToId.get(gs.cluster_name);
                    if (!clusterId) {
                        const match = snapshotClusters.find((c) => c.name === gs.cluster_name);
                        clusterId = match?.id;
                    }
                }
                if (!deviceId) {
                    console.warn("[batch-analyze] No device found for user, skipping goal creation");
                    continue;
                }
                const { todo: goal, action } = await todoRepo.createWithDedup({
                    device_id: deviceId,
                    user_id: userId,
                    text: gs.title,
                    level: 1,
                    source: "emerged",
                    status: "suggested",
                    cluster_id: clusterId,
                });
                if (action === "matched") {
                    // 去重命中，跳过
                    console.log(`[batch-analyze] Goal dedup matched: "${gs.title}"`);
                    continue;
                }
                snapshotGoals.push({
                    id: goal.id,
                    title: gs.title,
                    status: "suggested",
                    cluster_id: clusterId,
                });
                result.goals++;
                console.log(`[batch-analyze] Goal suggested: "${gs.title}"`);
            }
            catch (e) {
                console.error("[batch-analyze] Goal creation failed:", e);
            }
        }
        // 7h. supersedes
        const supersedes = Array.isArray(output.supersedes) ? output.supersedes : [];
        for (const s of supersedes) {
            if (!knownStrikeIds.has(s.new_strike_id))
                continue;
            try {
                await strikeRepo.updateStatus(s.old_strike_id, "superseded", s.new_strike_id);
                result.supersedes++;
            }
            catch (e) {
                // old_strike_id 可能不存在
            }
        }
        // 7i. cluster_tags
        const clusterTags = Array.isArray(output.cluster_tags) ? output.cluster_tags : [];
        for (const ct of clusterTags) {
            if (!knownClusterIds.has(ct.cluster_id) || !ct.tags?.length)
                continue;
            try {
                await strikeTagRepo.createMany(ct.tags.map((label) => ({
                    strike_id: ct.cluster_id,
                    label,
                    confidence: 0.8,
                    created_by: "batch-analyze",
                })));
            }
            catch (e) {
                // 标签可能已存在
            }
        }
        // 8. 更新 snapshot
        const lastStrike = newStrikeRows[newStrikeRows.length - 1];
        try {
            // 收集当前活跃的目标（统一模型：todo.level>=1）
            const activeGoals = await todoRepo.findGoalsByDomain(userId);
            const goalSnapshot = activeGoals
                .map((g) => ({
                id: g.id,
                title: g.text,
                status: g.status ?? "active",
                cluster_id: g.cluster_id ?? undefined,
            }));
            await snapshotRepo.upsert(userId, {
                clusters: snapshotClusters,
                goals: goalSnapshot,
                contradictions: [
                    ...(snapshot?.contradictions ?? []),
                    ...(output.contradictions ?? []).map((c) => ({
                        strike_a_nucleus: newStrikeRows.find((s) => s.id === c.strike_a_id)?.nucleus ?? "",
                        strike_b_nucleus: newStrikeRows.find((s) => s.id === c.strike_b_id)?.nucleus ?? "",
                        description: c.description,
                    })),
                ],
                patterns: [
                    ...(snapshot?.patterns ?? []),
                    ...(output.patterns ?? [])
                        .filter((p) => (p.confidence ?? 0) >= 0.5)
                        .map((p) => ({ pattern: p.pattern, confidence: p.confidence })),
                ],
                last_analyzed_strike_id: lastStrike.id,
                strike_count: (snapshot?.strike_count ?? 0) + newStrikeRows.length,
            });
        }
        catch (e) {
            console.error("[batch-analyze] Snapshot update failed:", e);
        }
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`[batch-analyze] Done in ${elapsed}s: strikes=${result.strikeCount} clusters=${result.newClusters} ` +
            `merged=${result.mergedClusters} bonds=${result.bonds} contradictions=${result.contradictions} ` +
            `patterns=${result.patterns} goals=${result.goals} supersedes=${result.supersedes}`);
        return result;
    }
    catch (e) {
        console.error("[batch-analyze] Fatal error:", e);
        return empty;
    }
    finally {
        runningUsers.delete(userId);
    }
}
//# sourceMappingURL=batch-analyze.js.map