import { query, queryOne, execute } from "../pool.js";

export interface Goal {
  id: string;
  device_id: string;
  title: string;
  parent_id: string | null;
  status: "active" | "paused" | "completed" | "abandoned";
  source: "speech" | "chat" | "manual";
  created_at: string;
  updated_at: string;
}

export async function findActiveByDevice(deviceId: string): Promise<Goal[]> {
  return query<Goal>(
    `SELECT * FROM goal WHERE device_id = $1 AND status = 'active' ORDER BY created_at DESC`,
    [deviceId],
  );
}

export async function findActiveByUser(userId: string): Promise<Goal[]> {
  return query<Goal>(
    `SELECT * FROM goal WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC`,
    [userId],
  );
}

export async function findByUser(userId: string): Promise<Goal[]> {
  return query<Goal>(
    `SELECT * FROM goal WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
}

export async function findByDevice(deviceId: string): Promise<Goal[]> {
  return query<Goal>(
    `SELECT * FROM goal WHERE device_id = $1 ORDER BY created_at DESC`,
    [deviceId],
  );
}

export async function findById(id: string): Promise<Goal | null> {
  return queryOne<Goal>(`SELECT * FROM goal WHERE id = $1`, [id]);
}

export async function create(fields: {
  device_id: string;
  user_id?: string;
  title: string;
  parent_id?: string;
  source?: string;
}): Promise<Goal> {
  const row = await queryOne<Goal>(
    `INSERT INTO goal (device_id, user_id, title, parent_id, source) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [fields.device_id, fields.user_id ?? null, fields.title, fields.parent_id ?? null, fields.source ?? "speech"],
  );
  return row!;
}

export async function update(
  id: string,
  fields: { title?: string; status?: string; parent_id?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (fields.title !== undefined) {
    sets.push(`title = $${i++}`);
    params.push(fields.title);
  }
  if (fields.status !== undefined) {
    sets.push(`status = $${i++}`);
    params.push(fields.status);
  }
  if (fields.parent_id !== undefined) {
    sets.push(`parent_id = $${i++}`);
    params.push(fields.parent_id);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = now()`);
  params.push(id);
  await execute(`UPDATE goal SET ${sets.join(", ")} WHERE id = $${i}`, params);
}

export async function findWithTodos(goalId: string) {
  const todos = await query<{ id: string; text: string; done: boolean }>(
    `SELECT id, text, done FROM todo WHERE goal_id = $1 ORDER BY created_at`,
    [goalId],
  );
  return todos;
}
