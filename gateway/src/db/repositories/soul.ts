import { queryOne, execute } from "../pool.js";

export interface Soul {
  id: string;
  device_id: string;
  content: string;
  updated_at: string;
}

export async function findByDevice(deviceId: string): Promise<Soul | null> {
  return queryOne<Soul>(
    `SELECT * FROM soul WHERE device_id = $1`,
    [deviceId],
  );
}

export async function upsert(deviceId: string, content: string): Promise<void> {
  await execute(
    `INSERT INTO soul (device_id, content) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET content = $2, updated_at = now()`,
    [deviceId, content],
  );
}
