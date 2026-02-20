import { queryOne } from "../pool.js";
import { execute } from "../pool.js";

export interface Summary {
  id: string;
  record_id: string;
  title: string;
  short_summary: string;
  long_summary: string;
  created_at: string;
}

export async function findByRecordId(recordId: string): Promise<Summary | null> {
  return queryOne<Summary>(
    `SELECT * FROM summary WHERE record_id = $1`,
    [recordId],
  );
}

export async function create(fields: {
  record_id: string;
  title?: string;
  short_summary?: string;
  long_summary?: string;
}): Promise<Summary> {
  const row = await queryOne<Summary>(
    `INSERT INTO summary (record_id, title, short_summary, long_summary)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      fields.record_id,
      fields.title ?? "",
      fields.short_summary ?? "",
      fields.long_summary ?? "",
    ],
  );
  return row!;
}

export async function update(
  recordId: string,
  fields: { title?: string; short_summary?: string; long_summary?: string },
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (fields.title !== undefined) {
    sets.push(`title = $${i++}`);
    params.push(fields.title);
  }
  if (fields.short_summary !== undefined) {
    sets.push(`short_summary = $${i++}`);
    params.push(fields.short_summary);
  }
  if (fields.long_summary !== undefined) {
    sets.push(`long_summary = $${i++}`);
    params.push(fields.long_summary);
  }
  if (sets.length === 0) return;
  params.push(recordId);
  await execute(`UPDATE summary SET ${sets.join(", ")} WHERE record_id = $${i}`, params);
}
