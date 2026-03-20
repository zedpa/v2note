/**
 * Cognitive alerts — generates user-facing alerts for recent contradictions.
 */
import { query } from "../db/pool.js";
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export async function generateAlerts(userId) {
    // Find contradiction bonds created in the last 7 days, with both strikes' info
    const rows = await query(`SELECT b.*,
            sa.id as a_id, sa.nucleus as a_nucleus, sa.polarity as a_polarity, sa.created_at as a_created_at,
            sb.id as b_id, sb.nucleus as b_nucleus, sb.polarity as b_polarity, sb.created_at as b_created_at
     FROM bond b
     JOIN strike sa ON sa.id = b.source_strike_id
     JOIN strike sb ON sb.id = b.target_strike_id
     WHERE sa.user_id = $1
       AND b.type = 'contradiction'
       AND b.created_at >= NOW() - INTERVAL '7 days'
     ORDER BY b.created_at DESC`, [userId]);
    return rows.map((r) => ({
        type: "contradiction",
        strikeA: { id: r.a_id, nucleus: r.a_nucleus, polarity: r.a_polarity },
        strikeB: { id: r.b_id, nucleus: r.b_nucleus, polarity: r.b_polarity },
        bondId: r.id,
        description: `你在${formatDate(r.a_created_at)}说「${r.a_nucleus}」，但在${formatDate(r.b_created_at)}说「${r.b_nucleus}」，这两个观点可能存在矛盾。`,
    }));
}
//# sourceMappingURL=alerts.js.map