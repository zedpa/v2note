/**
 * 参谋上下文合并 — 为 chat 注入认知引擎数据。
 *
 * 场景：
 * 1. 目标详情"深入讨论"：注入 Strike/Bond 链路、矛盾、完成率
 * 2. 普通 chat 认知注入：关键词检测 + top-3 clusters + alerts
 * 3. 洞察"展开讨论"：矛盾双方 + 相关 cluster 成员 + 时间线
 * 4. 引用格式区分：📝 原声 vs 📄 素材
 * 5. 对话保存为日记：record(source_type='think', type='conversation')
 */
export declare function detectCognitiveQuery(message: string): boolean;
export interface ChatCognitiveContext {
    clusters: Array<{
        id: string;
        name: string;
        recentStrikeCount: number;
    }>;
    contradictions: Array<{
        strikeA: {
            id: string;
            nucleus: string;
        };
        strikeB: {
            id: string;
            nucleus: string;
        };
        bondId: string;
    }>;
    /** 可直接注入 system prompt 的文本 */
    contextString: string;
}
/** 加载普通 chat 的认知上下文：最近更新的 wiki 主题 + 矛盾/变化段落 */
export declare function loadChatCognitive(userId: string): Promise<ChatCognitiveContext>;
/** 构建目标深入讨论的完整上下文（从 wiki_page 加载） */
export declare function buildGoalDiscussionContext(goalId: string, userId: string): Promise<string>;
/** 构建洞察"展开讨论"的上下文（从 wiki_page 加载） */
export declare function buildInsightDiscussionContext(
/** wiki_page_id 或旧的 bondId（兼容） */
pageOrBondId: string, userId: string): Promise<string>;
/** 格式化引用：📝 原声 vs 📄 素材 */
export declare function formatCitation(record: {
    id: string;
    source_type: string;
    text: string;
    created_at: string;
}): string;
/** 将对话保存为新 record + transcript，进入 Digest 管道 */
export declare function saveConversationAsRecord(messages: Array<{
    role: string;
    content: string;
}>, userId: string, deviceId: string): Promise<string>;
