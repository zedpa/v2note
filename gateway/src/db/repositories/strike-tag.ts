import { query, queryOne, execute } from "../pool.js";

export interface StrikeTagEntry {
  id: string;
  strike_id: string;
  label: string;
  confidence: number;
  created_by: string;
  created_at: string;
}

export async function create(fields: {
  strike_id: string;
  label: string;
  confidence?: number;
  created_by?: string;
}): Promise<StrikeTagEntry> {
  const row = await queryOne<StrikeTagEntry>(
    `INSERT INTO strike_tag (strike_id, label, confidence, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      fields.strike_id,
      fields.label,
      fields.confidence ?? 0.8,
      fields.created_by ?? "digest",
    ],
  );
  return row!;
}

export async function createMany(
  tags: {
    strike_id: string;
    label: string;
    confidence?: number;
    created_by?: string;
  }[],
): Promise<StrikeTagEntry[]> {
  if (tags.length === 0) return [];
  const values: string[] = [];
  const params: any[] = [];
  let i = 1;
  for (const t of tags) {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
    params.push(
      t.strike_id,
      t.label,
      t.confidence ?? 0.8,
      t.created_by ?? "digest",
    );
  }
  return query<StrikeTagEntry>(
    `INSERT INTO strike_tag (strike_id, label, confidence, created_by)
     VALUES ${values.join(", ")} RETURNING *`,
    params,
  );
}

export async function findByStrike(
  strikeId: string,
): Promise<StrikeTagEntry[]> {
  return query<StrikeTagEntry>(
    `SELECT * FROM strike_tag WHERE strike_id = $1 ORDER BY created_at ASC`,
    [strikeId],
  );
}

export async function updateCreatedBy(
  id: string,
  createdBy: string,
): Promise<void> {
  await execute(
    `UPDATE strike_tag SET created_by = $1 WHERE id = $2`,
    [createdBy, id],
  );
}

export async function findByLabel(
  userId: string,
  label: string,
): Promise<StrikeTagEntry[]> {
  return query<StrikeTagEntry>(
    `SELECT st.* FROM strike_tag st
     JOIN strike s ON s.id = st.strike_id
     WHERE s.user_id = $1 AND st.label = $2
     ORDER BY st.created_at DESC`,
    [userId, label],
  );
}
