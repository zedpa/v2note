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
import {
  strikeRepo,
  bondRepo,
  strikeTagRepo,
  todoRepo,
  snapshotRepo,
  tagRepo,
} from "../db/repositories/index.js";
import { queryOne, query as dbQuery } from "../db/pool.js";
import {
  buildBatchAnalyzeMessages,
  toPromptStrikes,
  type BatchAnalyzeInput,
  type BatchAnalyzeOutput,
} from "./batch-analyze-prompt.js";
import type { SnapshotCluster, SnapshotGoal } from "../db/repositories/snapshot.js";
import { writeStrikeEmbedding, writeTodoEmbedding } from "./embed-writer.js";

// ── 配置 ───────────────────────────────────────────────────────────────

export const TIER2_STRIKE_THRESHOLD = 5;
const MAX_STRIKES_PER_BATCH = 150;
const AI_TIMEOUT = 300_000; // 5 分钟（增量分析含 assign 到已有 Cluster 需要更长时间）

// ── 并发锁 ─────────────────────────────────────────────────────────────

const runningUsers = new Set<string>();

// ── 结果类型 ───────────────────────────────────────────────────────────

export interface BatchAnalyzeResult {
  success: boolean;
  strikeCount: number;
  newClusters: number;
  mergedClusters: number;
  bonds: number;
  contradictions: number;
  patterns: number;
  goals: number;
  supersedes: number;
}

// ── 主入口 ─────────────────────────────────────────────────────────────

export async function runBatchAnalyze(userId: string): Promise<BatchAnalyzeResult> {
  const empty: BatchAnalyzeResult = {
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
    const deviceRow = await queryOne<{ id: string }>(
      `SELECT id FROM device WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const deviceId = deviceRow?.id ?? null;

    // 1. 读取 snapshot
    const snapshot = await snapshotRepo.findByUser(userId);

    // 2. 获取新 Strike
    const newStrikeRows = await snapshotRepo.getNewStrikes(
      userId,
      snapshot?.last_analyzed_strike_id ?? null,
      MAX_STRIKES_PER_BATCH,
    );

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
    const input: BatchAnalyzeInput = {
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

    // 4. 单次 AI 调用（用 fast 层：聚类分析不需要推理，需要快速响应）
    const resp = await chatCompletion(messages, {
      json: true,
      temperature: 0.3,
      timeout: AI_TIMEOUT,
      tier: "fast",
    });

    // 5. 解析输出
    console.log(`[batch-analyze] AI raw response (first 2000 chars):`, resp.content.slice(0, 2000));
    let output: BatchAnalyzeOutput;
    try {
      output = JSON.parse(resp.content);
    } catch (e) {
      console.error("[batch-analyze] Failed to parse AI JSON:", e);
      return empty;
    }
    console.log(`[batch-analyze] Parsed: new_clusters=${output.new_clusters?.length ?? 0}, assign=${output.assign?.length ?? 0}, bonds=${output.bonds?.length ?? 0}, merge=${output.merge_clusters?.length ?? 0}`);

    // 6. 已知 ID 集合（用于验证 AI 输出）
    const knownStrikeIds = new Set(newStrikeRows.map((s) => s.id));
    const knownClusterIds = new Set((snapshot?.clusters ?? []).map((c) => c.id));

    // 新建的 cluster name → id 映射
    const newClusterNameToId = new Map<string, string>();

    const result: BatchAnalyzeResult = {
      success: true, strikeCount: newStrikeRows.length,
      newClusters: 0, mergedClusters: 0, bonds: 0,
      contradictions: 0, patterns: 0, goals: 0, supersedes: 0,
    };

    // 收集新 snapshot 数据
    const snapshotClusters: SnapshotCluster[] = [...(snapshot?.clusters ?? [])];
    const snapshotGoals: SnapshotGoal[] = [...(snapshot?.goals ?? [])];

    // 7a. new_clusters — 先创建聚类（后续 assign 可能引用）
    for (const nc of output.new_clusters ?? []) {
      if (!nc.name || !nc.member_strike_ids?.length) {
        console.log(`[batch-analyze] Cluster skipped (no name or members): ${JSON.stringify(nc).slice(0, 200)}`);
        continue;
      }
      const validMembers = nc.member_strike_ids.filter((id) => knownStrikeIds.has(id));
      if (validMembers.length === 0) {
        console.log(`[batch-analyze] Cluster "${nc.name}" skipped: 0 valid members out of ${nc.member_strike_ids.length} (IDs not in knownStrikeIds)`);
        console.log(`[batch-analyze]   member_ids: ${nc.member_strike_ids.slice(0, 5).join(", ")}`);
        console.log(`[batch-analyze]   known sample: ${[...knownStrikeIds].slice(0, 3).join(", ")}`);
        continue;
      }

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

        // 异步写入 embedding
        void writeStrikeEmbedding(cluster.id, `[${nc.name}] ${nc.description ?? ""}`);

        // 设置 Cluster 的 domain（L3 维度归属）
        if (nc.domain) {
          await queryOne(`UPDATE strike SET domain = $1 WHERE id = $2`, [nc.domain, cluster.id]);
        }

        // 创建 cluster_member bonds
        await bondRepo.createMany(
          validMembers.map((id) => ({
            source_strike_id: cluster.id,
            target_strike_id: id,
            type: "cluster_member",
            strength: 1.0,
            created_by: "batch-analyze",
          })),
        );

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
      } catch (e) {
        console.error(`[batch-analyze] Failed to create cluster "${nc.name}":`, e);
      }
    }

    // 7b. assign — 将 Strike 归入已有聚类
    for (const a of output.assign ?? []) {
      if (!knownStrikeIds.has(a.strike_id) || !knownClusterIds.has(a.cluster_id)) continue;
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
        if (sc) sc.size++;
      } catch (e) {
        // 可能已存在，忽略
      }
    }

    // 7c. merge_clusters
    for (const mc of output.merge_clusters ?? []) {
      if (!knownClusterIds.has(mc.cluster_a_id) || !knownClusterIds.has(mc.cluster_b_id)) continue;
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

        // 异步写入 embedding
        void writeStrikeEmbedding(merged.id, `[${mc.new_name}] ${mc.reason ?? ""}`);

        // 迁移旧聚类的成员到新聚类
        for (const oldClusterId of [mc.cluster_a_id, mc.cluster_b_id]) {
          const members = await bondRepo.findByStrike(oldClusterId);
          const memberIds = members
            .filter((b) => b.type === "cluster_member" && b.source_strike_id === oldClusterId)
            .map((b) => b.target_strike_id);

          if (memberIds.length > 0) {
            await bondRepo.createMany(
              memberIds.map((id) => ({
                source_strike_id: merged.id,
                target_strike_id: id,
                type: "cluster_member",
                strength: 1.0,
                created_by: "batch-analyze",
              })),
            );
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
      } catch (e) {
        console.error(`[batch-analyze] Merge failed:`, e);
      }
    }

    // 7d. bonds
    const validBonds = (output.bonds ?? []).filter(
      (b) =>
        (knownStrikeIds.has(b.source_strike_id) || knownClusterIds.has(b.source_strike_id)) &&
        (knownStrikeIds.has(b.target_strike_id) || knownClusterIds.has(b.target_strike_id)),
    );
    if (validBonds.length > 0) {
      try {
        await bondRepo.createMany(
          validBonds.map((b) => ({
            source_strike_id: b.source_strike_id,
            target_strike_id: b.target_strike_id,
            type: b.type || "context_of",
            strength: b.strength ?? 0.5,
            created_by: "batch-analyze",
          })),
        );
        result.bonds = validBonds.length;
      } catch (e) {
        console.error("[batch-analyze] Bonds creation failed:", e);
      }
    }

    // 7e. contradictions
    for (const c of output.contradictions ?? []) {
      if (!knownStrikeIds.has(c.strike_a_id) || !knownStrikeIds.has(c.strike_b_id)) continue;
      try {
        await bondRepo.create({
          source_strike_id: c.strike_a_id,
          target_strike_id: c.strike_b_id,
          type: "contradiction",
          strength: c.severity === "high" ? 0.9 : c.severity === "medium" ? 0.7 : 0.5,
          created_by: "batch-analyze",
        });
        result.contradictions++;
      } catch (e) {
        // 可能已存在
      }
    }

    // 7f. patterns
    for (const p of output.patterns ?? []) {
      if (!p.pattern || (p.confidence ?? 0) < 0.5) continue;
      try {
        const patternStrike = await strikeRepo.create({
          user_id: userId,
          nucleus: p.pattern,
          polarity: "realize",
          confidence: p.confidence,
          source_type: "inference",
        });

        void writeStrikeEmbedding(patternStrike.id, p.pattern);

        const validEvidence = (p.evidence_strike_ids ?? []).filter((id) => knownStrikeIds.has(id));
        if (validEvidence.length > 0) {
          await bondRepo.createMany(
            validEvidence.map((id) => ({
              source_strike_id: patternStrike.id,
              target_strike_id: id,
              type: "abstracted_from",
              strength: 0.8,
              created_by: "batch-analyze",
            })),
          );
        }
        result.patterns++;
        console.log(`[batch-analyze] Pattern: "${p.pattern}"`);
      } catch (e) {
        console.error("[batch-analyze] Pattern creation failed:", e);
      }
    }

    // 7g. goal_suggestions — 创建为 level=1 的 todo（统一模型）
    for (const gs of output.goal_suggestions ?? []) {
      if (!gs.title) continue;
      try {
        // 找到关联的 cluster_id（通过名称匹配 snapshot 或新建的聚类）
        let clusterId: string | undefined;
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
          console.log(`[batch-analyze] Goal dedup matched: "${gs.title}"`);
          continue;
        }
        // 新目标写入 embedding
        void writeTodoEmbedding(goal.id, gs.title, 1);

        snapshotGoals.push({
          id: goal.id,
          title: gs.title,
          status: "suggested",
          cluster_id: clusterId,
        });

        result.goals++;
        console.log(`[batch-analyze] Goal suggested: "${gs.title}"`);
      } catch (e) {
        console.error("[batch-analyze] Goal creation failed:", e);
      }
    }

    // 7h. supersedes
    const supersedes = Array.isArray(output.supersedes) ? output.supersedes : [];
    for (const s of supersedes) {
      if (!knownStrikeIds.has(s.new_strike_id)) continue;
      try {
        await strikeRepo.updateStatus(s.old_strike_id, "superseded", s.new_strike_id);
        result.supersedes++;
      } catch (e) {
        // old_strike_id 可能不存在
      }
    }

    // 7i. cluster_tags — 写入 strike_tag + 传播到 record_tag（让 timeline 展示聚类标签）
    const clusterTags = Array.isArray(output.cluster_tags) ? output.cluster_tags : [];
    for (const ct of clusterTags) {
      if (!knownClusterIds.has(ct.cluster_id) || !ct.tags?.length) continue;
      try {
        await strikeTagRepo.createMany(
          ct.tags.map((label) => ({
            strike_id: ct.cluster_id,
            label,
            confidence: 0.8,
            created_by: "batch-analyze",
          })),
        );
      } catch (e) {
        // 标签可能已存在
      }

      // 传播：cluster 名称 → 成员 strike 的 source record → record_tag
      try {
        // 从 nucleus 中提取聚类名（格式 "[名称] 描述"）
        const clusterStrike = newStrikeRows.find((s) => s.id === ct.cluster_id)
          ?? await strikeRepo.findById(ct.cluster_id);
        if (!clusterStrike) continue;
        const nameMatch = clusterStrike.nucleus.match(/^\[(.+?)\]/);
        const clusterName = nameMatch?.[1] ?? clusterStrike.nucleus.slice(0, 20);

        // upsert tag
        const tag = await tagRepo.upsert(clusterName);

        // 查找该 cluster 的所有成员 strike 的 source record
        const memberRecords = await dbQuery<{ source_id: string }>(
          `SELECT DISTINCT s.source_id FROM bond b
           JOIN strike s ON s.id = b.target_strike_id
           WHERE b.source_strike_id = $1 AND b.type = 'cluster_member'
             AND s.source_id IS NOT NULL`,
          [ct.cluster_id],
        );

        for (const mr of memberRecords) {
          await tagRepo.addToRecord(mr.source_id, tag.id);
        }
      } catch (e) {
        // 非关键路径，静默失败
      }
    }

    // 8. 更新 snapshot
    const lastStrike = newStrikeRows[newStrikeRows.length - 1];
    try {
      // 收集当前活跃的目标（统一模型：todo.level>=1）
      const activeGoals = await todoRepo.findGoalsByDomain(userId);
      const goalSnapshot: SnapshotGoal[] = activeGoals
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
    } catch (e) {
      console.error("[batch-analyze] Snapshot update failed:", e);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `[batch-analyze] Done in ${elapsed}s: strikes=${result.strikeCount} clusters=${result.newClusters} ` +
        `merged=${result.mergedClusters} bonds=${result.bonds} contradictions=${result.contradictions} ` +
        `patterns=${result.patterns} goals=${result.goals} supersedes=${result.supersedes}`,
    );

    // L2 涌现：本批有新 cluster 产出且用户总 L1 >= 3 时，尝试合并为 L2
    if (result.newClusters >= 1) {
      import("../db/pool.js")
        .then(({ query }) =>
          query<{ cnt: number }>(
            `SELECT COUNT(*)::int AS cnt FROM strike
             WHERE user_id = $1 AND is_cluster = true AND level = 1 AND status = 'active'`,
            [userId],
          ),
        )
        .then((rows) => {
          const totalL1 = rows[0]?.cnt ?? 0;
          if (totalL1 >= 3) {
            return import("./emergence.js").then(({ runEmergence }) => runEmergence(userId));
          }
          return null;
        })
        .then((er) => {
          if (er) console.log(`[batch-analyze] L2 emergence: ${er.higherOrderClusters} created`);
        })
        .catch((e) => console.error("[batch-analyze] L2 emergence failed:", e));
    }

    return result;
  } catch (e) {
    console.error("[batch-analyze] Fatal error:", e);
    return empty;
  } finally {
    runningUsers.delete(userId);
  }
}
