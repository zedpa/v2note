/**
 * Cognitive maintenance: bond normalization, strength decay, salience decay/boost.
 */
import { execute } from "../db/pool.js";
// ---------------------------------------------------------------------------
// Bond type normalization mapping
// ---------------------------------------------------------------------------
const BOND_TYPE_MAP = {
    causes: "causal",
    caused_by: "causal",
    leads_to: "causal",
    led_to: "causal",
    supports: "supports",
    backed_by: "supports",
    evidence_for: "supports",
    contradicts: "contradiction",
    conflicts_with: "contradiction",
    opposes: "contradiction",
    evolves_from: "evolution",
    evolved_into: "evolution",
    changed_to: "evolution",
    elaborates: "elaborates",
    details: "elaborates",
    expands: "elaborates",
    triggers: "triggers",
    triggered_by: "triggers",
    prompted: "triggers",
    resolves: "resolves",
    resolved_by: "resolves",
    addresses: "resolves",
};
// ---------------------------------------------------------------------------
// 1. Bond type normalization
// ---------------------------------------------------------------------------
export async function normalizeBondTypes(userId) {
    const synonyms = Object.keys(BOND_TYPE_MAP);
    // Build CASE expression
    const caseClauses = synonyms
        .map((s, i) => `WHEN b.type = $${i + 2} THEN '${BOND_TYPE_MAP[s]}'`)
        .join(" ");
    const sql = `
    UPDATE bond AS b
    SET type = CASE ${caseClauses} END
    FROM strike AS s
    WHERE b.source_strike_id = s.id
      AND s.user_id = $1
      AND b.type IN (${synonyms.map((_, i) => `$${i + 2}`).join(", ")})
  `;
    return execute(sql, [userId, ...synonyms]);
}
// ---------------------------------------------------------------------------
// 2. Bond strength decay
// ---------------------------------------------------------------------------
export async function decayBondStrength(userId) {
    const sql = `
    UPDATE bond AS b
    SET strength = CASE
      WHEN b.updated_at < now() - interval '90 days' THEN b.strength * 0.7
      WHEN b.updated_at < now() - interval '30 days' THEN b.strength * 0.9
    END
    FROM strike AS s
    WHERE b.source_strike_id = s.id
      AND s.user_id = $1
      AND b.strength > 0.1
      AND b.updated_at < now() - interval '30 days'
  `;
    return execute(sql, [userId]);
}
// ---------------------------------------------------------------------------
// 3. Salience decay
// ---------------------------------------------------------------------------
export async function decaySalience(userId) {
    const sql = `
    UPDATE strike SET salience = GREATEST(0.01, salience * 0.95)
    WHERE user_id = $1 AND status = 'active'
      AND id NOT IN (
        SELECT source_strike_id FROM bond WHERE created_at > now() - interval '30 days'
        UNION
        SELECT target_strike_id FROM bond WHERE created_at > now() - interval '30 days'
      )
      AND (digested_at IS NULL OR digested_at < now() - interval '30 days')
  `;
    return execute(sql, [userId]);
}
// ---------------------------------------------------------------------------
// 4. Salience boost
// ---------------------------------------------------------------------------
export async function boostSalience(strikeId) {
    await execute(`UPDATE strike SET salience = LEAST(1.0, salience + 0.1) WHERE id = $1`, [strikeId]);
}
//# sourceMappingURL=maintenance.js.map