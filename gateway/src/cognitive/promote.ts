/**
 * Promote module — semantic fusion of Strikes.
 *
 * Identifies Strikes within a cluster that are essentially saying the same thing
 * (not merely related) and promotes them into a higher-order abstracted Strike.
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { strikeRepo, bondRepo } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
import type { StrikeEntry } from "../db/repositories/strike.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PromoteResult {
  promoted: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PromoteGroup {
  member_indices: number[];
  abstracted_nucleus: string;
  polarity: string;
  confidence: number;
}

interface AIPromoteResponse {
  groups: PromoteGroup[];
}

interface ClusterWithMembers {
  clusterId: string;
  members: StrikeEntry[];
}

// ---------------------------------------------------------------------------
// Step 1: Load clusters and their members
// ---------------------------------------------------------------------------

async function loadClusters(userId: string): Promise<ClusterWithMembers[]> {
  const rows = await query<StrikeEntry & { cluster_id: string }>(
    `SELECT s.*, b.source_strike_id AS cluster_id
     FROM bond b
     JOIN strike s ON s.id = b.target_strike_id
     WHERE b.type = 'cluster_member'
       AND s.user_id = $1
       AND s.status = 'active'
     ORDER BY b.source_strike_id, s.created_at`,
    [userId],
  );

  const byCluster = new Map<string, StrikeEntry[]>();
  for (const r of rows) {
    const cid = r.cluster_id;
    if (!byCluster.has(cid)) byCluster.set(cid, []);
    byCluster.get(cid)!.push(r);
  }

  const results: ClusterWithMembers[] = [];
  for (const [clusterId, members] of byCluster) {
    if (members.length >= 3) {
      results.push({ clusterId, members });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Step 2: AI semantic fusion detection
// ---------------------------------------------------------------------------

async function detectFusionGroups(members: StrikeEntry[]): Promise<PromoteGroup[]> {
  const list = members
    .map((s, i) => `${i}. [${s.polarity}] ${s.nucleus}`)
    .join("\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `以下是一个聚类中的认知记录。找出其中'本质在说同一件事'的子组——不是相关，而是同一个认知的不同表述。

对每个子组输出：
- member_indices: 成员索引数组（0-based）
- abstracted_nucleus: 提炼后的更高阶表述
- polarity: perceive|judge|realize|intend|feel
- confidence: 0-1

返回 JSON：{"groups": [{"member_indices": [], "abstracted_nucleus": "", "polarity": "", "confidence": 0}]}
如果没有可融合的子组，返回 {"groups": []}`,
    },
    { role: "user", content: list },
  ];

  const res = await chatCompletion(messages, { json: true, temperature: 0.3 });

  try {
    const parsed = JSON.parse(res.content) as AIPromoteResponse;
    if (!Array.isArray(parsed.groups)) return [];
    return parsed.groups.filter(
      (g) =>
        Array.isArray(g.member_indices) &&
        g.member_indices.length >= 2 &&
        typeof g.abstracted_nucleus === "string" &&
        g.abstracted_nucleus.length > 0,
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 3: De-duplicate against existing promoted Strikes
// ---------------------------------------------------------------------------

async function findExistingPromoted(userId: string): Promise<string[]> {
  const rows = await query<{ nucleus: string }>(
    `SELECT DISTINCT s.nucleus
     FROM strike s
     JOIN bond b ON b.source_strike_id = s.id
     WHERE s.user_id = $1
       AND s.status = 'active'
       AND b.type = 'abstracted_from'`,
    [userId],
  );
  return rows.map((r) => r.nucleus);
}

function isDuplicate(nucleus: string, existing: string[]): boolean {
  const lower = nucleus.toLowerCase();
  for (const e of existing) {
    const eLower = e.toLowerCase();
    if (eLower.includes(lower) || lower.includes(eLower)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Step 4: Create promoted Strike + abstracted_from bonds
// ---------------------------------------------------------------------------

async function createPromotedStrike(
  userId: string,
  group: PromoteGroup,
  memberStrikes: StrikeEntry[],
): Promise<string> {
  const promoted = await strikeRepo.create({
    user_id: userId,
    nucleus: group.abstracted_nucleus,
    polarity: group.polarity,
    is_cluster: false,
    confidence: group.confidence,
    salience: 1.0,
    source_type: "promote",
  });

  await bondRepo.createMany(
    memberStrikes.map((m) => ({
      source_strike_id: promoted.id,
      target_strike_id: m.id,
      type: "abstracted_from",
      strength: 0.9,
      created_by: "promote",
    })),
  );

  return promoted.id;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runPromote(userId: string): Promise<PromoteResult> {
  console.log(`[promote] Starting for user ${userId}`);

  // Step 1: Load clusters with >= 3 active members
  const clusters = await loadClusters(userId);
  console.log(`[promote] Found ${clusters.length} eligible cluster(s)`);

  if (clusters.length === 0) {
    return { promoted: 0, skipped: 0 };
  }

  // Load existing promoted nuclei for de-dup
  const existingNuclei = await findExistingPromoted(userId);

  let promoted = 0;
  let skipped = 0;

  for (const { clusterId, members } of clusters) {
    // Step 2: AI fusion detection (cap at 20 members)
    const capped = members.slice(0, 20);
    const groups = await detectFusionGroups(capped);

    if (groups.length === 0) {
      console.log(`[promote] Cluster ${clusterId}: no fusion groups found`);
      continue;
    }

    for (const group of groups) {
      // Validate indices
      const validIndices = group.member_indices.filter(
        (i) => i >= 0 && i < capped.length,
      );
      if (validIndices.length < 2) {
        skipped++;
        continue;
      }

      // Step 4: De-dup check
      if (isDuplicate(group.abstracted_nucleus, existingNuclei)) {
        console.log(`[promote] Skipped duplicate: "${group.abstracted_nucleus}"`);
        skipped++;
        continue;
      }

      // Create promoted Strike
      const memberStrikes = validIndices.map((i) => capped[i]);
      await createPromotedStrike(userId, group, memberStrikes);
      existingNuclei.push(group.abstracted_nucleus);
      promoted++;
      console.log(
        `[promote] Promoted ${validIndices.length} strikes → "${group.abstracted_nucleus}"`,
      );
    }
  }

  console.log(`[promote] Done. promoted=${promoted} skipped=${skipped}`);
  return { promoted, skipped };
}
