/**
 * user_agent CRUD — 每用户个性化交互规则
 *
 * 存储用户自定义的规则、流程偏好、skill 配置、通知偏好。
 * 不包含 AI 人格内容（那是 Soul 的领域）。
 */
import { queryOne, execute } from "../pool.js";
/** 当前模板版本 */
export const CURRENT_TEMPLATE_VERSION = 1;
/** 默认模板 */
export const DEFAULT_TEMPLATE = `## 我的规则
（用户自定义的做事规则，AI 必须遵守）

## 我的流程偏好
- 录音后自动整理成日记
- 待办创建后按项目分组

## 技能配置
（所有技能默认关闭，用户明确开启后才可用）

## 通知偏好
- 晨间简报: 开启（早上 9:00）
- 晚间回顾: 开启（晚上 21:00）
- 主动问候: 关闭`;
/** 按 userId 查找，不存在则用默认模板创建 */
export async function findOrCreate(userId) {
    const existing = await queryOne(`SELECT * FROM user_agent WHERE user_id = $1`, [userId]);
    if (existing)
        return existing;
    // 创建默认模板
    const created = await queryOne(`INSERT INTO user_agent (user_id, content, template_version)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING *`, [userId, DEFAULT_TEMPLATE, CURRENT_TEMPLATE_VERSION]);
    // ON CONFLICT 时 RETURNING 为空，再查一次
    return created ?? (await queryOne(`SELECT * FROM user_agent WHERE user_id = $1`, [userId]));
}
/** 按 userId 查找（不自动创建） */
export async function findByUser(userId) {
    return queryOne(`SELECT * FROM user_agent WHERE user_id = $1`, [userId]);
}
/** 更新 content */
export async function updateContent(userId, content) {
    await execute(`UPDATE user_agent SET content = $1, updated_at = now() WHERE user_id = $2`, [content, userId]);
}
/** 更新 content + template_version（模板升级时用） */
export async function updateWithVersion(userId, content, version) {
    await execute(`UPDATE user_agent SET content = $1, template_version = $2, updated_at = now() WHERE user_id = $3`, [content, version, userId]);
}
//# sourceMappingURL=user-agent.js.map