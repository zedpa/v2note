import { queryOne } from "../pool.js";
export async function findById(id) {
    return queryOne(`SELECT * FROM app_user WHERE id = $1`, [id]);
}
export async function findByPhone(phone) {
    return queryOne(`SELECT * FROM app_user WHERE phone = $1`, [phone]);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO app_user (phone, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING *`, [fields.phone, fields.password_hash, fields.display_name ?? null]);
    return row;
}
//# sourceMappingURL=app-user.js.map