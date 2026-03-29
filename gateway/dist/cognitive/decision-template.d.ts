/**
 * 决策模板涌现
 * - detectClosedLoops: 检测完整决策闭环（goal 完成 + todo 全完成）
 * - saveTemplate: 保存决策模板
 * - matchTemplate: 语义匹配已有模板
 */
export interface ClosedLoop {
    goalId: string;
    title: string;
    completedTodos: number;
    totalTodos: number;
}
/**
 * 检测最近完成/归档的 goal，且所有关联 todo 已完成，尚未保存为模板。
 */
export declare function detectClosedLoops(userId: string): Promise<ClosedLoop[]>;
export interface TemplateInput {
    userId: string;
    goalId: string;
    title: string;
    steps: string[];
    outcome?: string;
    tags?: string[];
}
export declare function saveTemplate(input: TemplateInput): Promise<string>;
export interface MatchedTemplate {
    id: string;
    title: string;
    steps: string[];
    outcome: string | null;
}
/**
 * 通过关键词匹配查找相似的决策模板。
 */
export declare function matchTemplate(userId: string, text: string): Promise<MatchedTemplate[]>;
