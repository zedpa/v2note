import { queryOne, execute } from "../pool.js";
import { createHash } from "node:crypto";
/** Hash a raw token for storage */
export function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO refresh_token (user_id, token_hash, device_id, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`, [fields.user_id, fields.token_hash, fields.device_id ?? null, fields.expires_at.toISOString()]);
    return row;
}
export async function findByHash(tokenHash) {
    return queryOne(`SELECT * FROM refresh_token WHERE token_hash = $1 AND expires_at > now()`, [tokenHash]);
}
export async function deleteByHash(tokenHash) {
    await execute(`DELETE FROM refresh_token WHERE token_hash = $1`, [tokenHash]);
}
export async function deleteByUser(userId) {
    await execute(`DELETE FROM refresh_token WHERE user_id = $1`, [userId]);
}
//# sourceMappingURL=refresh-token.js.map