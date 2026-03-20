import { query, queryOne, execute } from "../pool.js";
export async function create(fields) {
    const row = await queryOne(`INSERT INTO strike_tag (strike_id, label, confidence, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`, [
        fields.strike_id,
        fields.label,
        fields.confidence ?? 0.8,
        fields.created_by ?? "digest",
    ]);
    return row;
}
export async function createMany(tags) {
    if (tags.length === 0)
        return [];
    const values = [];
    const params = [];
    let i = 1;
    for (const t of tags) {
        values.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
        params.push(t.strike_id, t.label, t.confidence ?? 0.8, t.created_by ?? "digest");
    }
    return query(`INSERT INTO strike_tag (strike_id, label, confidence, created_by)
     VALUES ${values.join(", ")} RETURNING *`, params);
}
export async function findByStrike(strikeId) {
    return query(`SELECT * FROM strike_tag WHERE strike_id = $1 ORDER BY created_at ASC`, [strikeId]);
}
export async function updateCreatedBy(id, createdBy) {
    await execute(`UPDATE strike_tag SET created_by = $1 WHERE id = $2`, [createdBy, id]);
}
export async function findByLabel(userId, label) {
    return query(`SELECT st.* FROM strike_tag st
     JOIN strike s ON s.id = st.strike_id
     WHERE s.user_id = $1 AND st.label = $2
     ORDER BY st.created_at DESC`, [userId, label]);
}
//# sourceMappingURL=strike-tag.js.map