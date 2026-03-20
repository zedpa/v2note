import { query, queryOne, execute } from "../pool.js";
export async function create(fields) {
    const row = await queryOne(`INSERT INTO bond (source_strike_id, target_strike_id, type, strength, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`, [
        fields.source_strike_id,
        fields.target_strike_id,
        fields.type,
        fields.strength ?? 0.5,
        fields.created_by ?? "digest",
    ]);
    return row;
}
export async function createMany(bonds) {
    if (bonds.length === 0)
        return [];
    const values = [];
    const params = [];
    let i = 1;
    for (const b of bonds) {
        values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        params.push(b.source_strike_id, b.target_strike_id, b.type, b.strength ?? 0.5, b.created_by ?? "digest");
    }
    return query(`INSERT INTO bond (source_strike_id, target_strike_id, type, strength, created_by)
     VALUES ${values.join(", ")} RETURNING *`, params);
}
export async function findByStrike(strikeId) {
    return query(`SELECT * FROM bond WHERE source_strike_id = $1 OR target_strike_id = $1
     ORDER BY created_at DESC`, [strikeId]);
}
export async function findByType(userId, type, limit) {
    return query(`SELECT b.* FROM bond b
     JOIN strike s ON s.id = b.source_strike_id
     WHERE s.user_id = $1 AND b.type = $2
     ORDER BY b.created_at DESC LIMIT $3`, [userId, type, limit ?? 100]);
}
export async function updateStrength(id, strength) {
    await execute(`UPDATE bond SET strength = $1, updated_at = now() WHERE id = $2`, [strength, id]);
}
//# sourceMappingURL=bond.js.map