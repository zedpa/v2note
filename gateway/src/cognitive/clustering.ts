/**
 * Level 2 clustering engine.
 *
 * Uses triangle-closure density to discover cluster candidates among active
 * Strikes, validates them with AI, and persists results.
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { strikeRepo, bondRepo } from "../db/repositories/index.js";
import { query, execute } from "../db/pool.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { BondEntry } from "../db/repositories/bond.js";
import { buildClusteringPrompt } from "./clustering-prompt.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClusteringResult {
  newClusters: number;
  updatedClusters: number;
  totalStrikes: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AIClusterVerdict {
  valid: boolean;
  name?: string;
  description?: string;
  polarity?: string;
}

// ---------------------------------------------------------------------------
// Step 1: Load graph data
// ---------------------------------------------------------------------------

async function loadGraph(userId: string) {
  const strikes = await strikeRepo.findActive(userId, 500);
  const strikeMap = new Map<string, StrikeEntry>();
  const ids: string[] = [];
  for (const s of strikes) {
    if (!s.is_cluster && s.source_type !== "material") {
      strikeMap.set(s.id, s);
      ids.push(s.id);
    }
  }

  const adj = new Map<string, Set<string>>();
  for (const id of ids) adj.set(id, new Set());

  if (ids.length === 0) return { adj, strikeMap };

  const ph = ids.map((_, i) => `$${i + 1}`).join(", ");
  const bonds = await query<BondEntry>(
    `SELECT * FROM bond
     WHERE source_strike_id IN (${ph})
       AND target_strike_id IN (${ph})`,
    [...ids, ...ids],
  );

  const idSet = new Set(ids);
  for (const b of bonds) {
    if (idSet.has(b.source_strike_id) && idSet.has(b.target_strike_id)) {
      adj.get(b.source_strike_id)!.add(b.target_strike_id);
      adj.get(b.target_strike_id)!.add(b.source_strike_id);
    }
  }

  return { adj, strikeMap };
}

// ---------------------------------------------------------------------------
// Step 2: Triangle closure density per node
// ---------------------------------------------------------------------------

function computeClosureScores(adj: Map<string, Set<string>>): Map<string, number> {
  const scores = new Map<string, number>();

  for (const [node, neighbors] of adj) {
    if (neighbors.size < 2) {
      scores.set(node, 0);
      continue;
    }
    const nArr = [...neighbors];
    let triangles = 0;
    let possible = 0;
    for (let i = 0; i < nArr.length; i++) {
      for (let j = i + 1; j < nArr.length; j++) {
        possible++;
        if (adj.get(nArr[i])?.has(nArr[j])) triangles++;
      }
    }
    scores.set(node, possible > 0 ? triangles / possible : 0);
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Step 3: Candidate discovery (seed + BFS + merge)
// ---------------------------------------------------------------------------

function discoverCandidates(
  adj: Map<string, Set<string>>,
  closureScores: Map<string, number>,
): string[][] {
  const visited = new Set<string>();
  const raw: string[][] = [];

  // Seeds: closure > 0.3, sorted descending
  const seeds = [...closureScores.entries()]
    .filter(([, s]) => s > 0.3)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  for (const seed of seeds) {
    if (visited.has(seed)) continue;

    const cluster: string[] = [];
    const inCluster = new Set<string>();
    const queue = [seed];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (inCluster.has(cur) || visited.has(cur)) continue;

      // BFS expansion: require closure > 0.2 (seed always qualifies)
      if (inCluster.size > 0 && (closureScores.get(cur) ?? 0) <= 0.2) continue;

      inCluster.add(cur);
      visited.add(cur);
      cluster.push(cur);

      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb) && !inCluster.has(nb)) queue.push(nb);
      }
    }

    if (cluster.length >= 3) {
      raw.push(cluster);
    } else {
      for (const id of cluster) visited.delete(id);
    }
  }

  // Merge overlapping > 50%
  const merged: string[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < raw.length; i++) {
    if (used.has(i)) continue;
    const setA = new Set(raw[i]);
    for (let j = i + 1; j < raw.length; j++) {
      if (used.has(j)) continue;
      const setB = new Set(raw[j]);
      const overlap = [...setB].filter((x) => setA.has(x)).length;
      const smaller = Math.min(setA.size, setB.size);
      if (overlap / smaller > 0.5) {
        for (const id of setB) setA.add(id);
        used.add(j);
      }
    }
    merged.push([...setA]);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Step 4: Filter against existing clusters
// ---------------------------------------------------------------------------

interface FilteredCandidate {
  memberIds: string[];
  existingClusterId?: string; // set if this is an incremental update
}

async function filterExisting(candidates: string[][]): Promise<FilteredCandidate[]> {
  const results: FilteredCandidate[] = [];

  for (const memberIds of candidates) {
    const ph = memberIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await query<{ cluster_strike_id: string; member_strike_id: string }>(
      `SELECT source_strike_id AS cluster_strike_id,
              target_strike_id AS member_strike_id
       FROM bond
       WHERE type = 'cluster_member'
         AND target_strike_id IN (${ph})`,
      memberIds,
    );

    // Group by cluster
    const byCluster = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!byCluster.has(r.cluster_strike_id)) byCluster.set(r.cluster_strike_id, new Set());
      byCluster.get(r.cluster_strike_id)!.add(r.member_strike_id);
    }

    let dominated = false;
    let updateTarget: string | undefined;

    for (const [clusterId, existing] of byCluster) {
      const ratio = existing.size / memberIds.length;
      if (ratio >= 0.7) {
        // 70%+ already in same cluster → skip entirely
        // But if there are new members, mark for incremental update
        const newMembers = memberIds.filter((id) => !existing.has(id));
        if (newMembers.length > 0) {
          updateTarget = clusterId;
        }
        dominated = true;
        break;
      }
    }

    if (dominated && updateTarget) {
      results.push({ memberIds, existingClusterId: updateTarget });
    } else if (!dominated) {
      results.push({ memberIds });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Step 5: AI review
// ---------------------------------------------------------------------------

async function aiReview(strikes: StrikeEntry[]): Promise<AIClusterVerdict> {
  const list = strikes
    .map((s, i) => `${i + 1}. [${s.polarity}] ${s.nucleus}`)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: buildClusteringPrompt() },
    { role: "user", content: list },
  ];

  const res = await chatCompletion(messages, { json: true, temperature: 0.3 });

  try {
    return JSON.parse(res.content) as AIClusterVerdict;
  } catch {
    return { valid: false };
  }
}

// ---------------------------------------------------------------------------
// Step 6: Create / update clusters + inter-cluster bonds
// ---------------------------------------------------------------------------

async function createCluster(
  userId: string,
  verdict: AIClusterVerdict,
  memberIds: string[],
): Promise<string> {
  const clusterStrike = await strikeRepo.create({
    user_id: userId,
    nucleus: `[${verdict.name}] ${verdict.description}`,
    polarity: verdict.polarity ?? "perceive",
    is_cluster: true,
    confidence: 0.7,
    salience: 1.0,
    source_type: "clustering",
    level: 1,
    origin: "emerged",
  });

  await bondRepo.createMany(
    memberIds.map((id) => ({
      source_strike_id: clusterStrike.id,
      target_strike_id: id,
      type: "cluster_member",
      strength: 1.0,
      created_by: "clustering",
    })),
  );

  return clusterStrike.id;
}

async function addMembersToCluster(clusterId: string, newMemberIds: string[]): Promise<void> {
  // Only add members not already present
  const existing = await query<{ target_strike_id: string }>(
    `SELECT target_strike_id FROM bond
     WHERE source_strike_id = $1 AND type = 'cluster_member'`,
    [clusterId],
  );
  const existingSet = new Set(existing.map((r) => r.target_strike_id));
  const toAdd = newMemberIds.filter((id) => !existingSet.has(id));

  if (toAdd.length > 0) {
    await bondRepo.createMany(
      toAdd.map((id) => ({
        source_strike_id: clusterId,
        target_strike_id: id,
        type: "cluster_member",
        strength: 1.0,
        created_by: "clustering",
      })),
    );
  }
}

async function buildInterClusterBonds(clusterIds: string[]): Promise<void> {
  if (clusterIds.length < 2) return;

  for (let i = 0; i < clusterIds.length; i++) {
    const membersA = await query<{ target_strike_id: string }>(
      `SELECT target_strike_id FROM bond
       WHERE source_strike_id = $1 AND type = 'cluster_member'`,
      [clusterIds[i]],
    );
    const setA = new Set(membersA.map((r) => r.target_strike_id));

    for (let j = i + 1; j < clusterIds.length; j++) {
      const membersB = await query<{ target_strike_id: string }>(
        `SELECT target_strike_id FROM bond
         WHERE source_strike_id = $1 AND type = 'cluster_member'`,
        [clusterIds[j]],
      );

      // Check if any member of B has a bond with any member of A
      const bIds = membersB.map((r) => r.target_strike_id);
      if (bIds.length === 0 || setA.size === 0) continue;

      const ph = bIds.map((_, k) => `$${k + 1}`).join(", ");
      const aArr = [...setA];
      const phA = aArr.map((_, k) => `$${k + bIds.length + 1}`).join(", ");

      const cross = await query<{ id: string }>(
        `SELECT id FROM bond
         WHERE source_strike_id IN (${ph}) AND target_strike_id IN (${phA})
            OR source_strike_id IN (${phA}) AND target_strike_id IN (${ph})
         LIMIT 1`,
        [...bIds, ...aArr],
      );

      if (cross.length > 0) {
        // Check bond doesn't already exist between clusters
        const existing = await query<{ id: string }>(
          `SELECT id FROM bond
           WHERE (source_strike_id = $1 AND target_strike_id = $2)
              OR (source_strike_id = $2 AND target_strike_id = $1)
           LIMIT 1`,
          [clusterIds[i], clusterIds[j]],
        );
        if (existing.length === 0) {
          await bondRepo.create({
            source_strike_id: clusterIds[i],
            target_strike_id: clusterIds[j],
            type: "cluster_link",
            strength: 0.5,
            created_by: "clustering",
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runClustering(userId: string): Promise<ClusteringResult> {
  console.log(`[clustering] Starting for user ${userId}`);

  // Step 1: Load graph
  const { adj, strikeMap } = await loadGraph(userId);
  const totalStrikes = strikeMap.size;

  if (totalStrikes === 0) {
    return { newClusters: 0, updatedClusters: 0, totalStrikes: 0 };
  }

  // Step 2: Triangle closure scores
  const closureScores = computeClosureScores(adj);

  // Step 3: Candidate discovery
  const candidates = discoverCandidates(adj, closureScores);
  console.log(`[clustering] Found ${candidates.length} candidate group(s)`);

  // Step 4: Filter existing clusters
  const filtered = await filterExisting(candidates);

  let newClusters = 0;
  let updatedClusters = 0;
  const allClusterIds: string[] = [];

  for (const candidate of filtered) {
    const members = candidate.memberIds
      .map((id) => strikeMap.get(id))
      .filter((s): s is StrikeEntry => s !== undefined);

    if (members.length < 3) continue;

    // Step 5: AI review (cap at 15 for prompt length)
    const capped = members.slice(0, 15);
    const verdict = await aiReview(capped);

    if (!verdict.valid || !verdict.name || !verdict.description) {
      console.log(`[clustering] Group of ${members.length} rejected by AI`);
      continue;
    }

    // Step 6: Create or update
    if (candidate.existingClusterId) {
      await addMembersToCluster(candidate.existingClusterId, candidate.memberIds);
      allClusterIds.push(candidate.existingClusterId);
      updatedClusters++;
      console.log(`[clustering] Updated cluster ${candidate.existingClusterId}`);
    } else {
      const cid = await createCluster(userId, verdict, candidate.memberIds);
      allClusterIds.push(cid);
      newClusters++;
      console.log(`[clustering] Created cluster "${verdict.name}" with ${candidate.memberIds.length} members`);
    }
  }

  // Inter-cluster bonds
  await buildInterClusterBonds(allClusterIds);

  console.log(`[clustering] Done. new=${newClusters} updated=${updatedClusters}`);
  return { newClusters, updatedClusters, totalStrikes };
}
