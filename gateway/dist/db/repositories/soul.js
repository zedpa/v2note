import { queryOne, execute } from "../pool.js";
export async function findByDevice(deviceId) {
    return queryOne(`SELECT * FROM soul WHERE device_id = $1`, [deviceId]);
}
export async function upsert(deviceId, content) {
    await execute(`INSERT INTO soul (device_id, content) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET content = $2, updated_at = now()`, [deviceId, content]);
}
//# sourceMappingURL=soul.js.map