/**
 * 知识生命周期管理
 * - scanExpiredFacts: 主动扫描过期 perceive Strike
 * - getSupersedAlerts: 生成过期确认 alert（注入晚间回顾）
 * - undoSupersede: 用户撤销自动 supersede
 */
export interface ExpiredFact {
    oldId: string;
    oldNucleus: string;
    newId: string;
    newNucleus: string;
    similarity: number;
}
/**
 * 扫描 60 天前的 perceive Strike，检查是否有新的相似 Strike 取代了它。
 * 基于 embedding 相似度检测。
 */
export declare function scanExpiredFacts(userId: string): Promise<ExpiredFact[]>;
export interface SupersedeAlert {
    type: "superseded";
    strikeId: string;
    nucleus: string;
    supersededBy: string;
    newNucleus: string;
    description: string;
}
/**
 * 获取最近被自动 supersede 的 Strike（7天内），生成确认 alert。
 */
export declare function getSupersedAlerts(userId: string): Promise<SupersedeAlert[]>;
/**
 * 用户不同意自动 supersede → 恢复 active 状态。
 */
export declare function undoSupersede(strikeId: string): Promise<void>;
