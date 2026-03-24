import { query, queryOne } from "../pool.js";

export interface Transcript {
  id: string;
  record_id: string;
  text: string;
  language: string | null;
  created_at: string;
}

export async function findByRecordId(recordId: string): Promise<Transcript | null> {
  return queryOne<Transcript>(
    `SELECT * FROM transcript WHERE record_id = $1`,
    [recordId],
  );
}

export async function findByRecordIds(recordIds: string[]): Promise<Transcript[]> {
  if (recordIds.length === 0) return [];
  const placeholders = recordIds.map((_, i) => `$${i + 1}`).join(", ");
  return query<Transcript>(
    `SELECT * FROM transcript WHERE record_id IN (${placeholders})`,
    recordIds,
  );
}

export async function update(recordId: string, fields: { text?: string; language?: string }): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (fields.text !== undefined) { sets.push(`text = $${i++}`); vals.push(fields.text); }
  if (fields.language !== undefined) { sets.push(`language = $${i++}`); vals.push(fields.language); }
  if (sets.length === 0) return;
  vals.push(recordId);
  await query(`UPDATE transcript SET ${sets.join(", ")} WHERE record_id = $${i}`, vals);
}

export async function create(fields: {
  record_id: string;
  text: string;
  language?: string;
}): Promise<Transcript> {
  const row = await queryOne<Transcript>(
    `INSERT INTO transcript (record_id, text, language) VALUES ($1, $2, $3) RETURNING *`,
    [fields.record_id, fields.text, fields.language ?? null],
  );
  return row!;
}
