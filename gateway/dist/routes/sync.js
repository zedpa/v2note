import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { recordRepo } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
export function registerSyncRoutes(router) {
    // Push sync entries
    router.post("/api/v1/sync/push", async (req, res) => {
        const deviceId = getDeviceId(req);
        const { entries } = await readBody(req);
        let uploaded = 0;
        for (const entry of entries ?? []) {
            await recordRepo.create({
                device_id: deviceId,
                status: entry.status ?? "completed",
                source: entry.source ?? "voice",
            });
            uploaded++;
        }
        sendJson(res, { uploaded });
    });
    // Pull sync (cursor-based)
    router.get("/api/v1/sync/pull", async (req, res, _params, qp) => {
        const deviceId = getDeviceId(req);
        const cursor = qp.cursor;
        const limit = 50;
        let rows;
        if (cursor) {
            rows = await query(`SELECT * FROM record WHERE device_id = $1 AND created_at > $2
         ORDER BY created_at ASC LIMIT $3`, [deviceId, cursor, limit]);
        }
        else {
            rows = await query(`SELECT * FROM record WHERE device_id = $1
         ORDER BY created_at ASC LIMIT $2`, [deviceId, limit]);
        }
        const newCursor = rows.length > 0 ? rows[rows.length - 1].created_at : cursor ?? null;
        sendJson(res, { records: rows, cursor: newCursor });
    });
}
//# sourceMappingURL=sync.js.map