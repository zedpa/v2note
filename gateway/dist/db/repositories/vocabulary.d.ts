/**
 * domain_vocabulary CRUD — 领域词汇表管理
 */
export interface VocabularyEntry {
    id: string;
    device_id: string;
    user_id: string | null;
    term: string;
    aliases: string[];
    domain: string;
    frequency: number;
    source: "preset" | "user" | "auto";
    created_at: string;
}
export interface CreateVocabularyInput {
    deviceId: string;
    userId?: string | null;
    term: string;
    aliases?: string[];
    domain: string;
    source?: "preset" | "user" | "auto";
}
/** 按设备查询所有词汇 */
export declare function findByDevice(deviceId: string): Promise<VocabularyEntry[]>;
/** 按用户查询所有词汇 */
export declare function findByUser(userId: string): Promise<VocabularyEntry[]>;
/** 搜索 aliases 数组中包含指定文本的词条（精确匹配 ANY） */
export declare function findByAliases(deviceId: string, text: string): Promise<VocabularyEntry[]>;
/** 创建词汇条目 */
export declare function create(input: CreateVocabularyInput): Promise<VocabularyEntry>;
/** 删除词汇条目 */
export declare function deleteById(id: string): Promise<number>;
/** 删除词汇条目（校验所有权：属于该用户或该设备） */
export declare function deleteByIdOwned(id: string, deviceId: string, userId?: string | null): Promise<number>;
/** 增加使用频率 */
export declare function incrementFrequency(id: string): Promise<void>;
