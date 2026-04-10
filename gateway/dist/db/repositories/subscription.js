import { queryOne } from "../pool.js";
import { monthRange, dayRange } from "../../lib/tz.js";
export async function getUsageStats(deviceId) {
    const month = monthRange();
    const monthStart = dayRange(month.start).start;
    const monthEnd = dayRange(month.end).end;
    const row = await queryOne(`SELECT COUNT(*)::text AS count FROM record
     WHERE device_id = $1 AND created_at >= $2 AND created_at <= $3`, [deviceId, monthStart, monthEnd]);
    return {
        monthly_count: parseInt(row?.count ?? "0", 10),
        limit: 500, // default limit
    };
}
export async function getUsageStatsByUser(userId) {
    const month = monthRange();
    const monthStart = dayRange(month.start).start;
    const monthEnd = dayRange(month.end).end;
    const row = await queryOne(`SELECT COUNT(*)::text AS count FROM record
     WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3`, [userId, monthStart, monthEnd]);
    return {
        monthly_count: parseInt(row?.count ?? "0", 10),
        limit: 500, // default limit
    };
}
//# sourceMappingURL=subscription.js.map