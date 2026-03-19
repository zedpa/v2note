/**
 * Proactive contradiction scanner.
 *
 * Scans recent Judge/Perceive strikes for contradictions against historical
 * strikes, uses AI to classify pairs, and creates bonds accordingly.
 */

import { chatCompletion } from "../ai/provider.js";
import { hybridRetrieve } from "./retrieval.js";
import { strikeRepo, bondRepo } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { BondEntry } from "../db/repositories/bond.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContradictionResult {
  strikeA: { id: string; nucleus: string; polarity: string };
  strikeB: { id: string; nucleus: string; polarity: string };
  verdict: "contradiction" | "perspective_of" | "none";
  explanation: string;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface CandidatePair {
  strikeA: StrikeEntry;
  strikeB: StrikeEntry;
}

interface AIVerdict {
  pair_idx: number;
  verdict: "contradiction" | "perspective_of" | "none";
  explanation: string;
}

/** Check whether a contradiction/perspective_of bond already exists between two strikes. */
async function bondExists(idA: string, idB: string): Promise<boolean> {
  const rows = await query<BondEntry>(
    `SELECT id FROM bond
     WHERE type IN ('contradiction', 'perspective_of')
       AND ((source_strike_id = $1 AND target_strike_id = $2)
         OR (source_strike_id = $2 AND target_strike_id = $1))
     LIMIT 1`,
    [idA, idB],
  );
  return rows.length > 0;
}

/** Ask AI to classify an array of candidate pairs. */
async function classifyPairs(pairs: CandidatePair[]): Promise<AIVerdict[]> {
  const pairDescriptions = pairs
    .map(
      (p, i) =>
        `对 ${i}:\nA (${p.strikeA.polarity}): ${p.strikeA.nucleus}\nB (${p.strikeB.polarity}): ${p.strikeB.nucleus}`,
    )
    .join("\n\n");

  const res = await chatCompletion(
    [
      {
        role: "system",
        content: `以下是几对可能存在矛盾的认知记录。对每对判断：
- contradiction: 两条记录在同一个问题上持相反立场，且不能同时为真
- perspective_of: 两条记录是对同一件事的不同视角，可以共存
- none: 没有实质矛盾

返回 JSON 数组：
[{"pair_idx": 0, "verdict": "contradiction", "explanation": "..."}, ...]`,
      },
      { role: "user", content: pairDescriptions },
    ],
    { json: true, temperature: 0.2 },
  );

  try {
    const parsed = JSON.parse(res.content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function scanContradictions(
  userId: string,
  daysBack?: number,
): Promise<ContradictionResult[]> {
  const days = daysBack ?? 7;

  // Step 1: fetch recent Judge/Perceive strikes
  const recentStrikes = await query<StrikeEntry>(
    `SELECT * FROM strike
     WHERE user_id = $1 AND status = 'active'
       AND polarity IN ('judge', 'perceive')
       AND created_at > now() - interval '${days} days'
     ORDER BY created_at DESC`,
    [userId],
  );

  if (recentStrikes.length === 0) return [];

  // Step 2: for each new strike, use hybridRetrieve polarity channel to find candidates
  const allPairs: CandidatePair[] = [];
  const seen = new Set<string>(); // "idA|idB" dedup within this scan

  for (const strike of recentStrikes) {
    const results = await hybridRetrieve(strike.nucleus, [], userId, {
      polarity: strike.polarity,
      limit: 5,
    });

    for (const r of results) {
      // Only keep opposite polarity & same-topic (score > 0.5)
      if (r.strike.polarity === strike.polarity) continue;
      if (r.score <= 0.5) continue;
      if (r.strike.id === strike.id) continue;

      const key = [strike.id, r.strike.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      // Dedup: skip if bond already exists
      const exists = await bondExists(strike.id, r.strike.id);
      if (exists) continue;

      allPairs.push({ strikeA: strike, strikeB: r.strike });
    }
  }

  if (allPairs.length === 0) return [];

  // Step 3: classify in batches of 10
  const results: ContradictionResult[] = [];

  for (let i = 0; i < allPairs.length; i += 10) {
    const batch = allPairs.slice(i, i + 10);
    const verdicts = await classifyPairs(batch);

    for (const v of verdicts) {
      if (v.pair_idx < 0 || v.pair_idx >= batch.length) continue;
      const pair = batch[v.pair_idx];

      results.push({
        strikeA: {
          id: pair.strikeA.id,
          nucleus: pair.strikeA.nucleus,
          polarity: pair.strikeA.polarity,
        },
        strikeB: {
          id: pair.strikeB.id,
          nucleus: pair.strikeB.nucleus,
          polarity: pair.strikeB.polarity,
        },
        verdict: v.verdict,
        explanation: v.explanation,
      });

      // Step 4: create bonds
      if (v.verdict === "contradiction") {
        await bondRepo.create({
          source_strike_id: pair.strikeA.id,
          target_strike_id: pair.strikeB.id,
          type: "contradiction",
          strength: 0.8,
          created_by: "contradiction_scan",
        });
      } else if (v.verdict === "perspective_of") {
        await bondRepo.create({
          source_strike_id: pair.strikeA.id,
          target_strike_id: pair.strikeB.id,
          type: "perspective_of",
          strength: 0.6,
          created_by: "contradiction_scan",
        });
      }
    }
  }

  return results;
}
