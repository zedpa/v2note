import { query, queryOne, execute } from "../pool.js";

export interface Tag {
  id: string;
  name: string;
}

export async function upsert(name: string): Promise<Tag> {
  const row = await queryOne<Tag>(
    `INSERT INTO tag (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [name],
  );
  return row!;
}

export async function findByName(name: string): Promise<Tag | null> {
  const row = await queryOne<Tag>(
    `SELECT * FROM tag WHERE name = $1`,
    [name],
  );
  return row ?? null;
}

export async function findAll(): Promise<Tag[]> {
  return query<Tag>(`SELECT * FROM tag ORDER BY name`);
}

export async function findByRecordId(recordId: string): Promise<Tag[]> {
  return query<Tag>(
    `SELECT t.* FROM tag t
     JOIN record_tag rt ON rt.tag_id = t.id
     WHERE rt.record_id = $1`,
    [recordId],
  );
}

export async function addToRecord(recordId: string, tagId: string): Promise<void> {
  await execute(
    `INSERT INTO record_tag (record_id, tag_id) VALUES ($1, $2)
     ON CONFLICT (record_id, tag_id) DO NOTHING`,
    [recordId, tagId],
  );
}

export async function removeFromRecord(recordId: string, tagId: string): Promise<void> {
  await execute(
    `DELETE FROM record_tag WHERE record_id = $1 AND tag_id = $2`,
    [recordId, tagId],
  );
}
