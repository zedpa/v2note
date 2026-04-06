import { queryOne, execute } from "../pool.js";
export async function findById(id) {
    return queryOne(`SELECT * FROM app_user WHERE id = $1`, [id]);
}
export async function findByPhone(phone) {
    return queryOne(`SELECT * FROM app_user WHERE phone = $1`, [phone]);
}
export async function findByEmail(email) {
    return queryOne(`SELECT * FROM app_user WHERE email = $1`, [email.toLowerCase()]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO app_user (phone, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING *`, [fields.phone, fields.password_hash, fields.display_name ?? null]);
    return row;
}
/** 邮箱注册创建用户（phone 为 NULL） */
export async function createWithEmail(fields) {
    const row = await queryOne(`INSERT INTO app_user (email, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING *`, [fields.email.toLowerCase(), fields.password_hash, fields.display_name ?? null]);
    return row;
}
/** 更新密码 */
export async function updatePassword(userId, passwordHash) {
    await execute(`UPDATE app_user SET password_hash = $1 WHERE id = $2`, [passwordHash, userId]);
}
/** 绑定/更新邮箱 */
export async function updateEmail(userId, email) {
    const row = await queryOne(`UPDATE app_user SET email = $1 WHERE id = $2 RETURNING *`, [email.toLowerCase(), userId]);
    return row;
}
/** 更新个人资料（昵称、头像） */
export async function updateProfile(userId, fields) {
    const sets = [];
    const params = [];
    let idx = 1;
    if (fields.display_name !== undefined) {
        sets.push(`display_name = $${idx++}`);
        params.push(fields.display_name);
    }
    if (fields.avatar_url !== undefined) {
        sets.push(`avatar_url = $${idx++}`);
        params.push(fields.avatar_url);
    }
    if (sets.length === 0) {
        return (await findById(userId));
    }
    params.push(userId);
    const row = await queryOne(`UPDATE app_user SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, params);
    return row;
}
//# sourceMappingURL=app-user.js.map