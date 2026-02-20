import { query, queryOne, execute } from "../pool.js";

export interface Idea {
  id: string;
  record_id: string;
  text: string;
  created_at: string;
}

export async function findByDevice(deviceId: string): Promise<Idea[]> {
  return query<Idea>(
    `SELECT i.* FROM idea i
     JOIN record r ON r.id = i.record_id
     WHERE r.device_id = $1
     ORDER BY i.created_at DESC`,
    [deviceId],
  );
}

export async function findByRecordId(recordId: string): Promise<Idea[]> {
  return query<Idea>(
    `SELECT * FROM idea WHERE record_id = $1 ORDER BY created_at`,
    [recordId],
  );
}

export async function create(fields: {
  record_id: string;
  text: string;
}): Promise<Idea> {
  const row = await queryOne<Idea>(
    `INSERT INTO idea (record_id, text) VALUES ($1, $2) RETURNING *`,
    [fields.record_id, fields.text],
  );
  return row!;
}

export async function del(id: string): Promise<void> {
  await execute(`DELETE FROM idea WHERE id = $1`, [id]);
}
