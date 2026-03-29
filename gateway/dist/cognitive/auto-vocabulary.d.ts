/**
 * 自动词汇收集 — 从用户近期记录中提取高频领域词汇
 * domain-vocabulary spec 场景 5
 *
 * 逻辑：
 * 1. 查询最近 7 天的 transcript
 * 2. 提取 2-4 字中文词汇
 * 3. 统计词频，过滤常用词
 * 4. 将 freq >= 3 且不在现有词库中的词汇自动入库
 */
/** 自动收集词汇，返回新增词汇数 */
export declare function autoCollectVocabulary(deviceId: string, userId?: string): Promise<number>;
