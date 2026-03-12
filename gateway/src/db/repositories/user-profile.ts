import { queryOne, execute } from "../pool.js";

export interface UserProfile {
  id: string;
  device_id: string;
  content: string;
  updated_at: string;
}

export async function findByDevice(deviceId: string): Promise<UserProfile | null> {
  return queryOne<UserProfile>(
    `SELECT * FROM user_profile WHERE device_id = $1`,
    [deviceId],
  );
}

export async function upsert(deviceId: string, content: string): Promise<void> {
  await execute(
    `INSERT INTO user_profile (device_id, content) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET content = $2, updated_at = now()`,
    [deviceId, content],
  );
}
