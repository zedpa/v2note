import { query, queryOne, execute } from "../pool.js";

export interface Todo {
  id: string;
  record_id: string;
  text: string;
  done: boolean;
  estimated_minutes: number | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  priority: number;
  completed_at: string | null;
  created_at: string;
}

export async function findByDevice(deviceId: string): Promise<Todo[]> {
  return query<Todo>(
    `SELECT t.* FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1
     ORDER BY t.created_at DESC`,
    [deviceId],
  );
}

export async function findByRecordId(recordId: string): Promise<Todo[]> {
  return query<Todo>(
    `SELECT * FROM todo WHERE record_id = $1 ORDER BY created_at`,
    [recordId],
  );
}

export async function create(fields: {
  record_id: string;
  text: string;
  done?: boolean;
}): Promise<Todo> {
  const row = await queryOne<Todo>(
    `INSERT INTO todo (record_id, text, done) VALUES ($1, $2, $3) RETURNING *`,
    [fields.record_id, fields.text, fields.done ?? false],
  );
  return row!;
}

export async function createMany(
  items: Array<{ record_id: string; text: string; done?: boolean }>,
): Promise<void> {
  if (items.length === 0) return;
  const values: string[] = [];
  const params: any[] = [];
  let i = 1;
  for (const item of items) {
    values.push(`($${i++}, $${i++}, $${i++})`);
    params.push(item.record_id, item.text, item.done ?? false);
  }
  await execute(
    `INSERT INTO todo (record_id, text, done) VALUES ${values.join(", ")}`,
    params,
  );
}

export async function update(
  id: string,
  fields: {
    text?: string;
    done?: boolean;
    estimated_minutes?: number | null;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    priority?: number;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (fields.text !== undefined) {
    sets.push(`text = $${i++}`);
    params.push(fields.text);
  }
  if (fields.done !== undefined) {
    sets.push(`done = $${i++}`);
    params.push(fields.done);
  }
  if (fields.estimated_minutes !== undefined) {
    sets.push(`estimated_minutes = $${i++}`);
    params.push(fields.estimated_minutes);
  }
  if (fields.scheduled_start !== undefined) {
    sets.push(`scheduled_start = $${i++}`);
    params.push(fields.scheduled_start);
  }
  if (fields.scheduled_end !== undefined) {
    sets.push(`scheduled_end = $${i++}`);
    params.push(fields.scheduled_end);
  }
  if (fields.priority !== undefined) {
    sets.push(`priority = $${i++}`);
    params.push(fields.priority);
  }
  if (sets.length === 0) return;
  params.push(id);
  await execute(`UPDATE todo SET ${sets.join(", ")} WHERE id = $${i}`, params);
}

export async function del(id: string): Promise<void> {
  await execute(`DELETE FROM todo WHERE id = $1`, [id]);
}

export async function toggle(id: string): Promise<Todo | null> {
  return queryOne<Todo>(
    `UPDATE todo SET done = NOT done WHERE id = $1 RETURNING *`,
    [id],
  );
}

export async function countByDateRange(
  deviceId: string,
  start: string,
  end: string,
): Promise<{ total: number; done: number }> {
  const row = await queryOne<{ total: string; done: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE t.done)::text AS done
     FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1 AND t.created_at >= $2 AND t.created_at <= $3`,
    [deviceId, start, end],
  );
  return {
    total: parseInt(row?.total ?? "0", 10),
    done: parseInt(row?.done ?? "0", 10),
  };
}

export async function findPendingByDevice(deviceId: string): Promise<Todo[]> {
  return query<Todo>(
    `SELECT t.* FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1 AND t.done = false
     ORDER BY t.created_at ASC`,
    [deviceId],
  );
}
