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
export declare function computeRecordRelations(recordId: string, strikes: StrikeEntry[], crossBonds: BondEntry[], targetStrikeCounts: Record<string, number>, strikeSourceTypes?: Record<string, string>, strikeToRecord?: Record<string, string>): Promise<RecordRelation[]>;
