/**
 * Level 3 weekly emergence engine.
 *
 * Discovers higher-order structures from cluster relationships,
 * detects cluster evolution, finds resonance, and extracts cognitive patterns.
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { strikeRepo, bondRepo } from "../db/repositories/index.js";
import { query, execute } from "../db/pool.js";
import { checkIntendEmergence } from "./goal-linker.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { BondEntry } from "../db/repositories/bond.js";

export interface EmergenceResult {
  higherOrderClusters: number;
  evolutionDetected: number;
  resonanceDiscovered: number;
  patternsExtracted: number;
  goalEmergence: number;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runEmergence(userId: string): Promise<EmergenceResult> {
  const result: EmergenceResult = {
    higherOrderClusters: 0,
    evolutionDetected: 0,
    resonanceDiscovered: 0,
    patternsExtracted: 0,
    goalEmergence: 0,
  };

  try {
    // Load all clusters
    const clusters = await query<StrikeEntry>(
      `SELECT * FROM strike WHERE user_id = $1 AND is_cluster = true AND status = 'active'`,
      [userId],
    );

    if (clusters.length < 2) {
      console.log("[emergence] Not enough clusters for emergence analysis");
      // 即使 cluster 不足以做 cross-analysis，仍检查 intend 密度
      for (const c of clusters) {
        const goal = await checkIntendEmergence(c, userId);
        if (goal) result.goalEmergence++;
      }
      return result;
    }

    // Load cluster members (exclude material for density analysis)
    const clusterMembers = new Map<string, StrikeEntry[]>();
    for (const c of clusters) {
      const members = await query<StrikeEntry>(
        `SELECT s.* FROM strike s
         JOIN bond cm ON cm.target_strike_id = s.id AND cm.type = 'cluster_member'
         WHERE cm.source_strike_id = $1 AND s.status = 'active'
           AND COALESCE(s.source_type, 'think') != 'material'`,
        [c.id],
      );
      clusterMembers.set(c.id, members);
    }

    // Step 1: Cross-cluster bond analysis
    result.higherOrderClusters = await buildCrossClusterBonds(clusters, clusterMembers);

    // Step 2: Evolution detection
    result.evolutionDetected = await detectEvolution(clusters, clusterMembers);

    // Step 3: Resonance discovery
    result.resonanceDiscovered = await discoverResonance(userId, clusters, clusterMembers);

    // Step 4: Pattern extraction
    result.patternsExtracted = await extractPatterns(userId);

    // Step 5: intend 密度涌现 → 自动建议目标
    for (const c of clusters) {
      try {
        const goal = await checkIntendEmergence(c, userId);
        if (goal) result.goalEmergence++;
      } catch (err) {
        console.error(`[emergence] Goal emergence check failed for cluster ${c.id}:`, err);
      }
    }

  } catch (err) {
    console.error("[emergence] Fatal error:", err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 1: Cross-cluster bonds
// ---------------------------------------------------------------------------

async function buildCrossClusterBonds(
  clusters: StrikeEntry[],
  clusterMembers: Map<string, StrikeEntry[]>,
): Promise<number> {
  let created = 0;

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const cA = clusters[i];
      const cB = clusters[j];
      const membersA = clusterMembers.get(cA.id) ?? [];
      const membersB = clusterMembers.get(cB.id) ?? [];

      if (membersA.length === 0 || membersB.length === 0) continue;

      // Check existing bond between clusters
      const existing = await query<BondEntry>(
        `SELECT id FROM bond
         WHERE (source_strike_id = $1 AND target_strike_id = $2)
            OR (source_strike_id = $2 AND target_strike_id = $1)
         LIMIT 1`,
        [cA.id, cB.id],
      );
      if (existing.length > 0) continue;

      // Count cross-member bonds
      const idsA = membersA.map((m) => m.id);
      const idsB = membersB.map((m) => m.id);
      const crossBonds = await query<{ type: string; cnt: string }>(
        `SELECT type, COUNT(*) as cnt FROM bond
         WHERE (source_strike_id = ANY($1) AND target_strike_id = ANY($2))
            OR (source_strike_id = ANY($2) AND target_strike_id = ANY($1))
         GROUP BY type ORDER BY cnt DESC`,
        [idsA, idsB],
      );

      const totalCross = crossBonds.reduce((s, r) => s + parseInt(r.cnt), 0);
      if (totalCross < 2) continue;

      // Create cluster-level bond with most common type
      const dominantType = crossBonds[0]?.type ?? "context_of";
      const strength = Math.min(1.0, totalCross * 0.15);

      await bondRepo.create({
        source_strike_id: cA.id,
        target_strike_id: cB.id,
        type: dominantType,
        strength,
        created_by: "emergence",
      });
      created++;
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// Step 2: Evolution detection
// ---------------------------------------------------------------------------

async function detectEvolution(
  clusters: StrikeEntry[],
  clusterMembers: Map<string, StrikeEntry[]>,
): Promise<number> {
  let detected = 0;

  for (const cluster of clusters) {
    const members = clusterMembers.get(cluster.id) ?? [];
    if (members.length < 3) continue;

    // Check recent growth
    const recentCount = members.filter((m) => {
      const age = Date.now() - new Date(m.created_at).getTime();
      return age < 7 * 86400000; // 7 days
    }).length;

    const olderCount = members.length - recentCount;
    const weeklyAvg = olderCount > 0 ? olderCount / 4 : 0; // rough avg over ~4 weeks

    if (recentCount > weeklyAvg * 2 && recentCount >= 3) {
      // Significant growth — tag the cluster
      try {
        await execute(
          `INSERT INTO strike_tag (strike_id, label, confidence, created_by)
           VALUES ($1, 'growing', 0.8, 'emergence')
           ON CONFLICT DO NOTHING`,
          [cluster.id],
        );
        detected++;
        console.log(`[emergence] Cluster "${cluster.nucleus.slice(0, 30)}" is growing rapidly`);
      } catch {
        // tag might already exist
      }
    }

    if (recentCount === 0 && members.length > 5) {
      // No new members — stagnant
      try {
        await execute(
          `INSERT INTO strike_tag (strike_id, label, confidence, created_by)
           VALUES ($1, 'stagnant', 0.6, 'emergence')
           ON CONFLICT DO NOTHING`,
          [cluster.id],
        );
        detected++;
      } catch {
        // ignore
      }
    }
  }

  return detected;
}

// ---------------------------------------------------------------------------
// Step 3: Resonance discovery
// ---------------------------------------------------------------------------

async function discoverResonance(
  userId: string,
  clusters: StrikeEntry[],
  clusterMembers: Map<string, StrikeEntry[]>,
): Promise<number> {
  let discovered = 0;

  // Find cluster pairs with cross bonds but different themes
  const clusterPairs: Array<{
    a: StrikeEntry;
    b: StrikeEntry;
    crossCount: number;
  }> = [];

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const membersA = clusterMembers.get(clusters[i].id) ?? [];
      const membersB = clusterMembers.get(clusters[j].id) ?? [];
      if (membersA.length === 0 || membersB.length === 0) continue;

      const idsA = membersA.map((m) => m.id);
      const idsB = membersB.map((m) => m.id);

      const [{ count }] = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM bond
         WHERE (source_strike_id = ANY($1) AND target_strike_id = ANY($2))
            OR (source_strike_id = ANY($2) AND target_strike_id = ANY($1))`,
        [idsA, idsB],
      );

      if (parseInt(count) >= 2) {
        clusterPairs.push({
          a: clusters[i],
          b: clusters[j],
          crossCount: parseInt(count),
        });
      }
    }
  }

  if (clusterPairs.length === 0) return 0;

  // AI batch review for resonance (max 5 pairs)
  const batch = clusterPairs.slice(0, 5);
  const pairDescriptions = batch.map((p, idx) => {
    const membersA = (clusterMembers.get(p.a.id) ?? [])
      .slice(0, 5)
      .map((m) => m.nucleus)
      .join("; ");
    const membersB = (clusterMembers.get(p.b.id) ?? [])
      .slice(0, 5)
      .map((m) => m.nucleus)
      .join("; ");
    return `对 ${idx}: 聚类A「${p.a.nucleus}」(成员: ${membersA}) — 聚类B「${p.b.nucleus}」(成员: ${membersB}) — 跨聚类关联: ${p.crossCount}条`;
  });

  try {
    const resp = await chatCompletion(
      [
        {
          role: "system",
          content: `以下是几对主题不同的聚类，但它们的成员之间有关联。判断每对是否有深层共振关系（表面不同但指向同一个更深层认知模式）。

返回 JSON 数组：
[{pair_idx: 0, resonance: true/false, pattern: "深层模式描述", confidence: 0.0-1.0}]`,
        },
        { role: "user", content: pairDescriptions.join("\n\n") },
      ],
      { json: true, temperature: 0.3 },
    );

    const results = JSON.parse(resp.content);
    if (!Array.isArray(results)) return 0;

    for (const r of results) {
      if (!r.resonance || r.pair_idx >= batch.length) continue;
      const pair = batch[r.pair_idx];

      // Check no existing resonance bond
      const existing = await query<BondEntry>(
        `SELECT id FROM bond
         WHERE type = 'resonance'
           AND ((source_strike_id = $1 AND target_strike_id = $2)
             OR (source_strike_id = $2 AND target_strike_id = $1))
         LIMIT 1`,
        [pair.a.id, pair.b.id],
      );
      if (existing.length > 0) continue;

      await bondRepo.create({
        source_strike_id: pair.a.id,
        target_strike_id: pair.b.id,
        type: "resonance",
        strength: r.confidence ?? 0.7,
        created_by: "emergence",
      });
      discovered++;
      console.log(
        `[emergence] Resonance: "${pair.a.nucleus.slice(0, 20)}" ↔ "${pair.b.nucleus.slice(0, 20)}" → ${r.pattern}`,
      );
    }
  } catch (err) {
    console.error("[emergence] Resonance AI call failed:", err);
  }

  return discovered;
}

// ---------------------------------------------------------------------------
// Step 4: Cognitive pattern extraction
// ---------------------------------------------------------------------------

async function extractPatterns(userId: string): Promise<number> {
  // Load all Judge strikes grouped by tag
  const judges = await query<StrikeEntry & { labels: string }>(
    `SELECT s.*, string_agg(st.label, ',') as labels
     FROM strike s
     LEFT JOIN strike_tag st ON st.strike_id = s.id
     WHERE s.user_id = $1 AND s.status = 'active' AND s.polarity = 'judge'
       AND COALESCE(s.source_type, 'think') != 'material'
     GROUP BY s.id
     ORDER BY s.created_at DESC
     LIMIT 50`,
    [userId],
  );

  if (judges.length < 5) return 0;

  // Check if we recently extracted patterns (within 7 days)
  const recent = await query<StrikeEntry>(
    `SELECT id FROM strike
     WHERE user_id = $1 AND source_type = 'inference' AND polarity = 'realize'
       AND created_at > now() - interval '7 days'
     LIMIT 1`,
    [userId],
  );
  if (recent.length > 0) return 0;

  try {
    const judgeList = judges.map((j, i) => `${i}. [${j.labels ?? ""}] ${j.nucleus}`);

    const resp = await chatCompletion(
      [
        {
          role: "system",
          content: `以下是用户在不同时间做出的判断。找出反复出现的决策模式或思维习惯。

对每个模式输出：
- pattern: 描述这个模式（一句话）
- evidence_indices: 支持这个模式的判断索引
- confidence: 0-1

返回 JSON: {"patterns": [{"pattern": "...", "evidence_indices": [0,3,7], "confidence": 0.8}]}
如果没有明显模式，返回 {"patterns": []}`,
        },
        { role: "user", content: judgeList.join("\n") },
      ],
      { json: true, temperature: 0.3 },
    );

    const parsed = JSON.parse(resp.content);
    const patterns = parsed.patterns ?? [];
    let created = 0;

    for (const p of patterns) {
      if (!p.pattern || p.confidence < 0.5) continue;

      // Create pattern Strike
      const patternStrike = await strikeRepo.create({
        user_id: userId,
        nucleus: p.pattern,
        polarity: "realize",
        confidence: p.confidence,
        source_type: "inference",
      });

      // Link to evidence
      for (const idx of p.evidence_indices ?? []) {
        if (idx < judges.length) {
          await bondRepo.create({
            source_strike_id: patternStrike.id,
            target_strike_id: judges[idx].id,
            type: "abstracted_from",
            strength: 0.8,
            created_by: "emergence",
          });
        }
      }

      created++;
      console.log(`[emergence] Pattern: "${p.pattern}" (${(p.evidence_indices ?? []).length} evidence)`);
    }

    return created;
  } catch (err) {
    console.error("[emergence] Pattern extraction failed:", err);
    return 0;
  }
}
