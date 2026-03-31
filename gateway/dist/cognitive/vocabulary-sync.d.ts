/**
 * DashScope VocabularyService 同步
 *
 * 将 domain_vocabulary 表中的词汇同步到 DashScope，
 * 生成/更新 vocabulary_id，供 Python ASR 脚本使用。
 *
 * 词汇是用户维度：同一用户所有设备共用一份 DashScope 热词表，
 * vocabulary_id 存储在 app_user 表，跨设备一致。
 *
 * 限制：DashScope 每表最多 500 词，超出按 frequency DESC 截断
 * 降级：同步失败不阻断 ASR（返回空字符串）
 */
/**
 * 同步词汇到 DashScope VocabularyService
 * @param deviceId 设备 ID，用于查找关联用户
 * @returns vocabulary_id（成功）或空字符串（失败/无词汇/未登录）
 */
export declare function syncVocabularyToDashScope(deviceId: string): Promise<string>;
/**
 * 通过 deviceId 直接获取用户的 vocabulary_id（供 ASR 启动时读取）
 * 不触发同步，仅读取缓存值
 */
export declare function getVocabularyIdForDevice(deviceId: string): Promise<string>;
