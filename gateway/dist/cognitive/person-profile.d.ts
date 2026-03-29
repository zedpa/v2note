/**
 * 人物画像系统
 * - scanPersons: 从 Strike tags 扫描高频人名，创建 person 记录
 * - extractPersonPatterns: AI 提取人物行为模式
 * - getPersonContext: 获取人物上下文（注入参谋对话）
 */
export interface ScanResult {
    newPersons: number;
    updated: number;
}
/**
 * 从 Strike tags 中扫描高频人名（出现 5+ 次），创建 person 记录。
 * 依赖 Digest prompt 中对人名的 tag 提取。
 */
export declare function scanPersons(userId: string): Promise<ScanResult>;
/**
 * AI 分析某人相关的所有 Strike，提取行为模式。
 */
export declare function extractPersonPatterns(personId: string): Promise<string[]>;
export interface PersonContext {
    name: string;
    patterns: string[];
    stats: Record<string, any>;
    recentStrikes: Array<{
        nucleus: string;
        polarity: string;
        date: string;
    }>;
}
/**
 * 获取人物画像上下文，用于注入参谋对话。
 */
export declare function getPersonContext(userId: string, personNames: string[]): Promise<PersonContext[]>;
