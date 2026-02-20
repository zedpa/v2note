import { query, queryOne, execute } from "../pool.js";

export interface Device {
  id: string;
  device_identifier: string;
  platform: string;
  user_type: string | null;
  custom_tags: any;
  created_at: string;
}

export async function findByIdentifier(identifier: string): Promise<Device | null> {
  return queryOne<Device>(
    `SELECT * FROM device WHERE device_identifier = $1`,
    [identifier],
  );
}

export async function create(identifier: string, platform: string): Promise<Device> {
  const row = await queryOne<Device>(
    `INSERT INTO device (device_identifier, platform) VALUES ($1, $2) RETURNING *`,
    [identifier, platform],
  );
  return row!;
}

export async function update(
  id: string,
  fields: { user_type?: string; custom_tags?: any },
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (fields.user_type !== undefined) {
    sets.push(`user_type = $${i++}`);
    params.push(fields.user_type);
  }
  if (fields.custom_tags !== undefined) {
    sets.push(`custom_tags = $${i++}`);
    params.push(JSON.stringify(fields.custom_tags));
  }
  if (sets.length === 0) return;
  params.push(id);
  await execute(`UPDATE device SET ${sets.join(", ")} WHERE id = $${i}`, params);
}
