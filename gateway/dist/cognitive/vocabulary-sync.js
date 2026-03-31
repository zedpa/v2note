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
import * as vocabRepo from "../db/repositories/vocabulary.js";
import { query, execute } from "../db/pool.js";
const DASHSCOPE_VOCAB_URL = "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/vocabulary";
const MAX_VOCAB_SIZE = 500;
/** 频率→权重映射（参照 spec 场景 3） */
function mapFrequencyToWeight(freq) {
    if (freq >= 10)
        return 5;
    if (freq >= 5)
        return 4;
    if (freq >= 1)
        return 3;
    return 2; // freq == 0（预设词）
}
/** 通过 deviceId 查找关联的 userId */
async function getUserIdByDevice(deviceId) {
    const rows = await query(`SELECT user_id FROM device WHERE id = $1`, [deviceId]);
    return rows[0]?.user_id ?? null;
}
/** 查询用户当前的 asr_vocabulary_id（存在 app_user 表） */
async function getUserVocabularyId(userId) {
    const rows = await query(`SELECT asr_vocabulary_id FROM app_user WHERE id = $1`, [userId]);
    return rows[0]?.asr_vocabulary_id ?? null;
}
/** 将 vocabulary_id 存入 app_user 表 */
async function saveUserVocabularyId(userId, vocabularyId) {
    await execute(`UPDATE app_user SET asr_vocabulary_id = $1 WHERE id = $2`, [vocabularyId, userId]);
}
/**
 * 同步词汇到 DashScope VocabularyService
 * @param deviceId 设备 ID，用于查找关联用户
 * @returns vocabulary_id（成功）或空字符串（失败/无词汇/未登录）
 */
export async function syncVocabularyToDashScope(deviceId) {
    try {
        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (!apiKey) {
            console.warn("[vocabulary-sync] DASHSCOPE_API_KEY not set, skip sync");
            return "";
        }
        // 1. 解析 userId（未登录设备无法同步）
        const userId = await getUserIdByDevice(deviceId);
        if (!userId) {
            console.warn(`[vocabulary-sync] Device ${deviceId} has no user_id, skip sync`);
            return "";
        }
        // 2. 获取该用户所有词汇（跨设备合并，按 frequency DESC，最多 500）
        const allEntries = await vocabRepo.findByUser(userId);
        if (allEntries.length === 0)
            return "";
        const sorted = [...allEntries].sort((a, b) => b.frequency - a.frequency);
        const top500 = sorted.slice(0, MAX_VOCAB_SIZE);
        const vocabulary = top500.map((e) => ({
            text: e.term,
            weight: mapFrequencyToWeight(e.frequency),
        }));
        // 3. 检查是否已有 vocabulary_id（用户维度）
        const existingId = await getUserVocabularyId(userId);
        // 4. 调用 DashScope API
        let vocabularyId;
        if (existingId) {
            // 后续同步：update_vocabulary（覆盖式）
            const resp = await fetch(DASHSCOPE_VOCAB_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "paraformer-v2",
                    input: {
                        action: "update_vocabulary",
                        vocabulary_id: existingId,
                        vocabulary,
                    },
                }),
            });
            if (!resp.ok) {
                const msg = await resp.text();
                console.error(`[vocabulary-sync] update_vocabulary failed ${resp.status}: ${msg}`);
                return "";
            }
            vocabularyId = existingId;
        }
        else {
            // 首次同步：create_vocabulary
            const resp = await fetch(DASHSCOPE_VOCAB_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "paraformer-v2",
                    input: {
                        action: "create_vocabulary",
                        vocabulary,
                    },
                }),
            });
            if (!resp.ok) {
                const msg = await resp.text();
                console.error(`[vocabulary-sync] create_vocabulary failed ${resp.status}: ${msg}`);
                return "";
            }
            const data = await resp.json();
            vocabularyId = data?.output?.vocabulary_id ?? "";
            if (!vocabularyId) {
                console.error("[vocabulary-sync] create_vocabulary returned no vocabulary_id");
                return "";
            }
            // 存储到 app_user（跨设备共享）
            await saveUserVocabularyId(userId, vocabularyId);
        }
        console.log(`[vocabulary-sync] User ${userId}: synced ${vocabulary.length} words, id=${vocabularyId}`);
        return vocabularyId;
    }
    catch (err) {
        console.error(`[vocabulary-sync] Failed for device ${deviceId}:`, err.message);
        return "";
    }
}
/**
 * 通过 deviceId 直接获取用户的 vocabulary_id（供 ASR 启动时读取）
 * 不触发同步，仅读取缓存值
 */
export async function getVocabularyIdForDevice(deviceId) {
    try {
        const rows = await query(`SELECT u.asr_vocabulary_id
       FROM device d
       JOIN app_user u ON u.id = d.user_id
       WHERE d.id = $1`, [deviceId]);
        return rows[0]?.asr_vocabulary_id ?? "";
    }
    catch {
        return "";
    }
}
//# sourceMappingURL=vocabulary-sync.js.map