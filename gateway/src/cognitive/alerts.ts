/**
 * Cognitive alerts — generates user-facing alerts for recent contradictions.
 */

import { query } from "../db/pool.js";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { BondEntry } from "../db/repositories/bond.js";

export interface CognitiveAlert {
  type: "contradiction";
  strikeA: { id: string; nucleus: string; polarity: string };
  strikeB: { id: string; nucleus: string; polarity: string };
  bondId: string;
  description: string;
}

interface RecentContradiction extends BondEntry {
  a_id: string;
  a_nucleus: string;
  a_polarity: string;
  a_created_at: string;
  b_id: string;
  b_nucleus: string;
  b_polarity: string;
  b_created_at: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function generateAlerts(
  userId: string,
): Promise<CognitiveAlert[]> {
  // Find contradiction bonds created in the last 7 days, with both strikes' info
  const rows = await query<RecentContradiction>(
    `SELECT b.*,
            sa.id as a_id, sa.nucleus as a_nucleus, sa.polarity as a_polarity, sa.created_at as a_created_at,
            sb.id as b_id, sb.nucleus as b_nucleus, sb.polarity as b_polarity, sb.created_at as b_created_at
     FROM bond b
     JOIN strike sa ON sa.id = b.source_strike_id
     JOIN strike sb ON sb.id = b.target_strike_id
     WHERE sa.user_id = $1
       AND b.type = 'contradiction'
       AND b.created_at >= NOW() - INTERVAL '7 days'
     ORDER BY b.created_at DESC`,
    [userId],
  );

  return rows.map((r) => ({
    type: "contradiction" as const,
    strikeA: { id: r.a_id, nucleus: r.a_nucleus, polarity: r.a_polarity },
    strikeB: { id: r.b_id, nucleus: r.b_nucleus, polarity: r.b_polarity },
    bondId: r.id,
    description: `你在${formatDate(r.a_created_at)}说「${r.a_nucleus}」，但在${formatDate(r.b_created_at)}说「${r.b_nucleus}」，这两个观点可能存在矛盾。`,
  }));
}
