import { query, queryOne, execute } from "../pool.js";

export interface Notebook {
  id: string;
  device_id: string;
  name: string;
  description: string | null;
  color: string;
  is_system: boolean;
  created_at: string;
}

export async function findByDevice(deviceId: string): Promise<Notebook[]> {
  return query<Notebook>(
    `SELECT * FROM notebook WHERE device_id = $1 ORDER BY is_system DESC, created_at`,
    [deviceId],
  );
}

export async function findByUser(userId: string): Promise<Notebook[]> {
  return query<Notebook>(
    `SELECT * FROM notebook WHERE user_id = $1 ORDER BY is_system DESC, created_at`,
    [userId],
  );
}

export async function findOrCreateByUser(
  userId: string,
  deviceId: string,
  name: string,
  description?: string,
  isSystem = false,
  color?: string,
): Promise<Notebook> {
  const row = await queryOne<Notebook>(
    `INSERT INTO notebook (user_id, device_id, name, description, is_system, color)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (device_id, name) DO UPDATE SET user_id = $1
     RETURNING *`,
    [userId, deviceId, name, description ?? null, isSystem, color ?? "#6366f1"],
  );
  return row!;
}

export async function findById(id: string): Promise<Notebook | null> {
  return queryOne<Notebook>(`SELECT * FROM notebook WHERE id = $1`, [id]);
}

export async function findOrCreate(
  deviceId: string,
  name: string,
  description?: string,
  isSystem = false,
  color?: string,
): Promise<Notebook> {
  const row = await queryOne<Notebook>(
    `INSERT INTO notebook (device_id, name, description, is_system, color)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_id, name) DO UPDATE SET device_id = notebook.device_id
     RETURNING *`,
    [deviceId, name, description ?? null, isSystem, color ?? "#6366f1"],
  );
  return row!;
}

export async function update(
  id: string,
  fields: { name?: string; description?: string | null; color?: string },
): Promise<Notebook | null> {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (fields.name !== undefined) { sets.push(`name = $${idx++}`); params.push(fields.name); }
  if (fields.description !== undefined) { sets.push(`description = $${idx++}`); params.push(fields.description); }
  if (fields.color !== undefined) { sets.push(`color = $${idx++}`); params.push(fields.color); }
  if (sets.length === 0) return findById(id);
  params.push(id);
  return queryOne<Notebook>(
    `UPDATE notebook SET ${sets.join(", ")} WHERE id = $${idx} AND is_system = false RETURNING *`,
    params,
  );
}

export async function deleteById(id: string): Promise<boolean> {
  const count = await execute(
    `DELETE FROM notebook WHERE id = $1 AND is_system = false`,
    [id],
  );
  return count > 0;
}

/**
 * Ensure system notebooks exist for a device.
 */
export async function ensureSystemNotebooks(deviceId: string): Promise<void> {
  await findOrCreate(deviceId, "ai-self", "AI 自用工作日记", true, "#8b5cf6");
  await findOrCreate(deviceId, "default", "用户日常日记", true, "#f59e0b");
}
