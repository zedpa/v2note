import { readBody, sendJson, getDeviceId, getUserId } from "../lib/http-helpers.js";
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
    // Pull sync (cursor-based) — uses userId for cross-device data
    router.get("/api/v1/sync/pull", async (req, res, _params, qp) => {
        const deviceId = getDeviceId(req);
        const userId = getUserId(req);
        const cursor = qp.cursor;
        const limit = 50;
        const idCol = userId ? "user_id" : "device_id";
        const idVal = userId ?? deviceId;
        let rows;
        if (cursor) {
            rows = await query(`SELECT * FROM record WHERE ${idCol} = $1 AND created_at > $2
         ORDER BY created_at ASC LIMIT $3`, [idVal, cursor, limit]);
        }
        else {
            rows = await query(`SELECT * FROM record WHERE ${idCol} = $1
         ORDER BY created_at ASC LIMIT $2`, [idVal, limit]);
        }
        const newCursor = rows.length > 0 ? rows[rows.length - 1].created_at : cursor ?? null;
        sendJson(res, { records: rows, cursor: newCursor });
    });
}
//# sourceMappingURL=sync.js.map