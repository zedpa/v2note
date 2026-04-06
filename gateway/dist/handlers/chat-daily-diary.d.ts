/**
 * 每日对话日记：daily-loop 中调用，生成当天 chat 总结写入 ai_diary
 * spec: chat-persistence.md 场景 6.1-6.3
 */
/**
 * 查询当天所有 chat 消息，生成日记段落写入 ai_diary。
 * 无消息时静默跳过。
 */
export declare function generateChatDiary(deviceId: string, userId: string, date: string): Promise<void>;
