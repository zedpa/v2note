import { queryOne, execute } from "../pool.js";

export interface UserProfile {
  id: string;
  device_id: string;
  content: string;
  name: string | null;
  pain_points: string | null;
  preferences: Record<string, any>;
  onboarding_done: boolean;
  updated_at: string;
}

export async function findByDevice(deviceId: string): Promise<UserProfile | null> {
  return queryOne<UserProfile>(
    `SELECT * FROM user_profile WHERE device_id = $1`,
    [deviceId],
  );
}

export async function findByUser(userId: string): Promise<UserProfile | null> {
  return queryOne<UserProfile>(
    `SELECT * FROM user_profile WHERE user_id = $1`,
    [userId],
  );
}

export async function upsertByUser(userId: string, content: string): Promise<void> {
  const existing = await findByUser(userId);
  if (existing) {
    await execute(
      `UPDATE user_profile SET content = $1, updated_at = now() WHERE id = $2`,
      [content, existing.id],
    );
  } else {
    await execute(
      `INSERT INTO user_profile (user_id, content) VALUES ($1, $2)`,
      [userId, content],
    );
  }
}

export async function upsert(deviceId: string, content: string): Promise<void> {
  await execute(
    `INSERT INTO user_profile (device_id, content) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET content = $2, updated_at = now()`,
    [deviceId, content],
  );
}

/** 更新 onboarding 相关的单个字段 */
export async function upsertOnboardingField(
  userId: string,
  field: "name" | "pain_points" | "onboarding_done",
  value: string,
): Promise<void> {
  const existing = await findByUser(userId);
  if (existing) {
    await execute(
      `UPDATE user_profile SET ${field} = $1, updated_at = now() WHERE id = $2`,
      [value, existing.id],
    );
  } else {
    await execute(
      `INSERT INTO user_profile (user_id, ${field}) VALUES ($1, $2)`,
      [userId, value],
    );
  }
}

/** 更新 preferences JSON */
export async function upsertPreferences(
  userId: string,
  prefs: Record<string, any>,
): Promise<void> {
  const existing = await findByUser(userId);
  if (existing) {
    await execute(
      `UPDATE user_profile SET preferences = preferences || $1::jsonb, updated_at = now() WHERE id = $2`,
      [JSON.stringify(prefs), existing.id],
    );
  } else {
    await execute(
      `INSERT INTO user_profile (user_id, preferences) VALUES ($1, $2::jsonb)`,
      [userId, JSON.stringify(prefs)],
    );
  }
}
