/**
 * Wiki 编译引擎主入口 — 每日/手动触发的知识编译
 *
 * 三阶段流程：
 *   A. 路由（轻量，不调 AI）— embedding 匹配 record→page
 *   B. 编译（1 次 AI 调用）— 生成编译指令
 *   C. 执行指令（单个 DB 事务）— 原子写入
 */
export interface CompileResult {
    pages_created: number;
    pages_updated: number;
    pages_split: number;
    pages_merged: number;
    records_compiled: number;
    summary?: string;
}
/** AI 返回的编译指令 */
export interface CompileInstructions {
    update_pages: Array<{
        page_id: string;
        new_content: string;
        new_summary: string;
        add_record_ids: string[];
    }>;
    create_pages: Array<{
        title: string;
        content: string;
        summary: string;
        parent_id: string | null;
        level: number;
        domain: string | null;
        record_ids: string[];
    }>;
    merge_pages: Array<{
        source_id: string;
        target_id: string;
        reason: string;
    }>;
    split_page: Array<{
        source_id: string;
        new_parent_content: string;
        children: Array<{
            title: string;
            content: string;
            summary: string;
        }>;
    }>;
    goal_sync: Array<{
        action: "create" | "update";
        goal_id?: string;
        title?: string;
        status?: string;
        wiki_page_id?: string;
        progress?: number;
    }>;
}
/**
 * 对指定用户执行 wiki 编译
 *
 * @param userId - 用户 ID
 * @param maxRecords - 最大处理 record 数（默认 30，重试时缩减）
 * @returns 编译结果
 */
export declare function compileWikiForUser(userId: string, maxRecords?: number): Promise<CompileResult>;
/** 余弦相似度计算 */
export declare function cosineSimilarity(a: number[], b: number[]): number;
/** 解析 AI 返回的 JSON */
export declare function parseCompileResponse(raw: string): CompileInstructions;
export declare function executeInstructions(instructions: CompileInstructions, userId: string, recordIds: string[]): Promise<CompileResult>;
