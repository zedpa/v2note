/**
 * Wiki 编译 prompt 构建 — 为 AI 编译引擎生成编译指令的 prompt
 *
 * 输入：新 Record 文本、命中的 wiki page content、全量 page 索引、已有 domain 列表
 * 输出：结构化的编译 prompt（系统提示 + 用户消息）
 */
/** 编译 prompt 输入 */
export interface CompilePromptInput {
    newRecords: {
        id: string;
        text: string;
        source_type: string;
        created_at: string;
    }[];
    matchedPages: {
        id: string;
        title: string;
        content: string;
        summary: string;
        level: number;
        domain: string | null;
    }[];
    allPageIndex: {
        id: string;
        title: string;
        summary: string | null;
        level: number;
        domain: string | null;
    }[];
    existingDomains: string[];
    isColdStart: boolean;
}
/** 编译 prompt 输出（系统 + 用户消息对） */
export interface CompilePromptOutput {
    system: string;
    user: string;
}
/**
 * 构建编译 prompt
 *
 * 指导 AI 阅读所有新 Record，参照已有 wiki page，
 * 输出 JSON 编译指令（update_pages, create_pages, split_page, merge_pages, goal_sync）
 */
export declare function buildCompilePrompt(input: CompilePromptInput): CompilePromptOutput;
