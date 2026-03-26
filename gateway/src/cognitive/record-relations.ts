/**
 * Record-level relation aggregation.
 *
 * Aggregates strike-level bonds into record-level relevance scores.
 * Formula: relevance = Σ(bond.strength) / max(strikeCount_A, strikeCount_B)
 * Material bonds are downweighted × 0.2.
 */

import type { StrikeEntry } from "../db/repositories/strike.js";
import type { BondEntry } from "../db/repositories/bond.js";

export interface RecordRelation {
  record_id: string;
  relevance: number;
}

/**
 * 计算某条日记与其他日记的关联度。
 *
 * @param recordId - 当前日记 ID
 * @param strikes - 当前日记的 strikes
 * @param crossBonds - 跨记录 bonds（已从 DB 获取）
 * @param targetStrikeCounts - 目标日记 ID → strike 数量
 * @param strikeSourceTypes - strike ID → source_type（用于 material 降权）
 * @param strikeToRecord - strike ID → record ID 映射（用于定位目标日记）
 */
export async function computeRecordRelations(
  recordId: string,
  strikes: StrikeEntry[],
  crossBonds: BondEntry[],
  targetStrikeCounts: Record<string, number>,
  strikeSourceTypes?: Record<string, string>,
  strikeToRecord?: Record<string, string>,
): Promise<RecordRelation[]> {
  const myStrikeIds = new Set(strikes.map((s) => s.id));
  const myStrikeCount = strikes.length;

  if (myStrikeCount === 0 || crossBonds.length === 0) return [];

  // 按目标日记分组累加 bond strength
  const recordStrengths = new Map<string, number>();

  for (const bond of crossBonds) {
    // 找到 bond 另一端的 strike
    const otherId = myStrikeIds.has(bond.source_strike_id)
      ? bond.target_strike_id
      : myStrikeIds.has(bond.target_strike_id)
        ? bond.source_strike_id
        : null;

    if (!otherId) continue;

    // 排除同一 record 内部 bond
    if (myStrikeIds.has(otherId)) continue;

    // 确定目标日记 ID（必须有映射）
    const targetRecordId = strikeToRecord?.[otherId];
    if (!targetRecordId) continue;
    if (targetRecordId === recordId) continue;

    // material 降权
    let strength = bond.strength;
    const otherSourceType = strikeSourceTypes?.[otherId];
    if (otherSourceType === "material") {
      strength *= 0.2;
    }

    recordStrengths.set(
      targetRecordId,
      (recordStrengths.get(targetRecordId) ?? 0) + strength,
    );
  }

  // 计算关联度
  const results: RecordRelation[] = [];
  for (const [recId, totalStrength] of recordStrengths) {
    const targetCount = targetStrikeCounts[recId] ?? 1;
    const relevance = totalStrength / Math.max(myStrikeCount, targetCount);
    if (relevance > 0.4) {
      results.push({ record_id: recId, relevance });
    }
  }

  // 降序排列，最多 10 条
  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, 10);
}
