import { query, execute } from "../pool.js";
export async function findByDevice(deviceId, dateRange, limit) {
    if (dateRange) {
        return query(`SELECT * FROM memory WHERE device_id = $1
       AND source_date >= $2 AND source_date <= $3
       ORDER BY importance DESC LIMIT $4`, [deviceId, dateRange.start, dateRange.end, limit ?? 50]);
    }
    return query(`SELECT * FROM memory WHERE device_id = $1
     ORDER BY importance DESC LIMIT $2`, [deviceId, limit ?? 50]);
}
export async function create(fields) {
    await execute(`INSERT INTO memory (device_id, content, source_date, importance)
     VALUES ($1, $2, $3, $4)`, [
        fields.device_id,
        fields.content,
        fields.source_date ?? null,
        fields.importance ?? 5,
    ]);
}
export async function deleteById(id, deviceId) {
    await execute(`DELETE FROM memory WHERE id = $1 AND device_id = $2`, [id, deviceId]);
}
export async function update(id, deviceId, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    if (fields.content !== undefined) {
        sets.push(`content = $${i++}`);
        params.push(fields.content);
    }
    if (fields.importance !== undefined) {
        sets.push(`importance = $${i++}`);
        params.push(fields.importance);
    }
    if (sets.length === 0)
        return;
    params.push(id, deviceId);
    await execute(`UPDATE memory SET ${sets.join(", ")} WHERE id = $${i++} AND device_id = $${i}`, params);
}
//# sourceMappingURL=memory.js.map