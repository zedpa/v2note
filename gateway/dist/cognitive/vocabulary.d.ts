/**
 * 领域词汇纠错引擎 — 基于用户词汇表的文本纠错
 * 目前实现精确别名匹配，后续可扩展 embedding 相似度
 */
export interface Correction {
    original: string;
    corrected: string;
    confidence: number;
}
export interface CorrectionResult {
    correctedText: string;
    corrections: Correction[];
}
/** 清除指定设备的缓存（词汇变更后调用） */
export declare function invalidateCache(deviceId: string): void;
/**
 * 使用用户词汇表纠正文本
 * 1. 获取设备词汇（带缓存）
 * 2. 遍历每个词条的 aliases，在文本中做大小写不敏感匹配
 * 3. 匹配到则替换为正确 term，confidence = 0.95
 */
export declare function correctText(deviceId: string, text: string): Promise<CorrectionResult>;
