import { query, execute } from "../pool.js";

export interface SkillConfig {
  id: string;
  device_id: string;
  skill_name: string;
  enabled: boolean;
  config: any;
}

export async function findByDevice(deviceId: string): Promise<SkillConfig[]> {
  return query<SkillConfig>(
    `SELECT * FROM skill_config WHERE device_id = $1`,
    [deviceId],
  );
}

export async function upsert(fields: {
  device_id: string;
  skill_name: string;
  enabled: boolean;
  config?: any;
}): Promise<void> {
  await execute(
    `INSERT INTO skill_config (device_id, skill_name, enabled, config)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (device_id, skill_name)
     DO UPDATE SET enabled = $3, config = $4`,
    [
      fields.device_id,
      fields.skill_name,
      fields.enabled,
      fields.config ? JSON.stringify(fields.config) : "{}",
    ],
  );
}
