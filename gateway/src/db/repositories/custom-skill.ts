import { query, queryOne, execute } from "../pool.js";

export interface CustomSkill {
  id: string;
  device_id: string;
  name: string;
  description: string;
  prompt: string;
  type: "review" | "process";
  enabled: boolean;
  created_by: "user" | "ai";
  created_at: string;
  updated_at: string;
}

export async function findByDevice(deviceId: string): Promise<CustomSkill[]> {
  return query<CustomSkill>(
    `SELECT * FROM custom_skill WHERE device_id = $1 ORDER BY created_at`,
    [deviceId],
  );
}

export async function findByUser(userId: string): Promise<CustomSkill[]> {
  return query<CustomSkill>(
    `SELECT * FROM custom_skill WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  );
}

export async function findByDeviceAndName(
  deviceId: string,
  name: string,
): Promise<CustomSkill | null> {
  return queryOne<CustomSkill>(
    `SELECT * FROM custom_skill WHERE device_id = $1 AND name = $2`,
    [deviceId, name],
  );
}

export async function findByUserAndName(
  userId: string,
  name: string,
): Promise<CustomSkill | null> {
  return queryOne<CustomSkill>(
    `SELECT * FROM custom_skill WHERE user_id = $1 AND name = $2`,
    [userId, name],
  );
}

export async function create(fields: {
  device_id: string;
  user_id?: string;
  name: string;
  description?: string;
  prompt: string;
  type?: "review" | "process";
  created_by?: "user" | "ai";
}): Promise<CustomSkill> {
  const rows = await query<CustomSkill>(
    `INSERT INTO custom_skill (device_id, user_id, name, description, prompt, type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      fields.device_id,
      fields.user_id ?? null,
      fields.name,
      fields.description ?? "",
      fields.prompt,
      fields.type ?? "review",
      fields.created_by ?? "user",
    ],
  );
  return rows[0];
}

export async function update(
  id: string,
  fields: {
    name?: string;
    description?: string;
    prompt?: string;
    type?: "review" | "process";
    enabled?: boolean;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (fields.name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(fields.name);
  }
  if (fields.description !== undefined) {
    sets.push(`description = $${idx++}`);
    params.push(fields.description);
  }
  if (fields.prompt !== undefined) {
    sets.push(`prompt = $${idx++}`);
    params.push(fields.prompt);
  }
  if (fields.type !== undefined) {
    sets.push(`type = $${idx++}`);
    params.push(fields.type);
  }
  if (fields.enabled !== undefined) {
    sets.push(`enabled = $${idx++}`);
    params.push(fields.enabled);
  }

  if (sets.length === 0) return;

  sets.push(`updated_at = now()`);
  params.push(id);

  await execute(
    `UPDATE custom_skill SET ${sets.join(", ")} WHERE id = $${idx}`,
    params,
  );
}

export async function deleteById(id: string): Promise<number> {
  return execute(`DELETE FROM custom_skill WHERE id = $1`, [id]);
}

export async function deleteByName(
  deviceId: string,
  name: string,
): Promise<number> {
  return execute(
    `DELETE FROM custom_skill WHERE device_id = $1 AND name = $2`,
    [deviceId, name],
  );
}

export async function deleteByUserAndName(
  userId: string,
  name: string,
): Promise<number> {
  return execute(
    `DELETE FROM custom_skill WHERE user_id = $1 AND name = $2`,
    [userId, name],
  );
}
