export interface ChatMessage {
    id: string;
    user_id: string;
    role: "user" | "assistant" | "context-summary";
    content: string;
    parts: any | null;
    compressed: boolean;
    created_at: string;
}
/**
 * 写入一条聊天消息（用户/AI回复/压缩摘要）
 * 返回新消息的 id
 */
export declare function saveMessage(userId: string, role: string, content: string, parts?: any): Promise<string>;
/**
 * 分页读取历史消息（用户视角，不含 context-summary）
 * 按时间倒序返回，前端需 reverse 后展示
 */
export declare function getHistory(userId: string, limit: number, before?: string): Promise<ChatMessage[]>;
/**
 * 获取所有 context-summary 消息（按时间正序，用于 AI 上下文组装）
 */
export declare function getContextSummaries(userId: string): Promise<ChatMessage[]>;
/**
 * 获取最近 N 条未压缩的 user/assistant 消息（用于 AI 上下文组装）
 */
export declare function getUncompressedMessages(userId: string, limit: number): Promise<ChatMessage[]>;
/**
 * 将指定消息标记为已压缩
 */
export declare function markCompressed(messageIds: string[]): Promise<void>;
/**
 * 获取指定日期的 user/assistant 消息（用于每日日记总结）
 */
export declare function getMessagesByDate(userId: string, date: string): Promise<ChatMessage[]>;
/**
 * 删除用户的所有聊天消息（含 context-summary）
 */
export declare function deleteAllByUser(userId: string): Promise<void>;
/**
 * 统计未压缩消息数量（用于判断是否触发压缩）
 */
export declare function countUncompressed(userId: string): Promise<number>;
