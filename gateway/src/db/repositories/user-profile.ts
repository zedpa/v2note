import { queryOne, execute } from "../pool.js";

export interface UserProfile {
  id: string;
  device_id: string;
  content: string;
  name: string | null;
  occupation: string | null;
  current_focus: string | null;
  pain_points: string | null;
  review_time: string | null;
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

export async function upsertByUser(userId: string, content: string, deviceId?: string): Promise<void> {
  let existing = await findByUser(userId);
  // 按 device_id 查找并补绑 user_id
  if (!existing && deviceId) {
    existing = await findByDevice(deviceId);
    if (existing) {
      await execute(`UPDATE user_profile SET user_id = $1 WHERE id = $2`, [userId, existing.id]);
    }
  }
  if (existing) {
    await execute(
      `UPDATE user_profile SET content = $1, updated_at = now() WHERE id = $2`,
      [content, existing.id],
    );
  } else {
    try {
      await execute(
        `INSERT INTO user_profile (user_id, device_id, content) VALUES ($1, $2, $3)`,
        [userId, deviceId ?? null, content],
      );
    } catch (e: any) {
      if (e.code === "23505") {
        const row = await findByUser(userId);
        if (row) await execute(`UPDATE user_profile SET content = $1, updated_at = now() WHERE id = $2`, [content, row.id]);
      } else { throw e; }
    }
  }
}

/** @deprecated 使用 upsertByUser 替代 */
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
  field: "name" | "occupation" | "current_focus" | "pain_points" | "review_time" | "onboarding_done",
  value: string,
  deviceId?: string,
): Promise<void> {
  // 1. 优先按 user_id 查
  let existing = await findByUser(userId);

  // 2. 未找到 → 按 device_id 查（profile 可能在注册时只绑了 device_id）
  if (!existing && deviceId) {
    existing = await findByDevice(deviceId);
    if (existing) {
      // 补绑 user_id
      await execute(`UPDATE user_profile SET user_id = $1 WHERE id = $2`, [userId, existing.id]);
    }
  }

  if (existing) {
    await execute(
      `UPDATE user_profile SET ${field} = $1, updated_at = now() WHERE id = $2`,
      [value, existing.id],
    );
  } else {
    // INSERT — 查设备 ID 作为元数据
    if (!deviceId) {
      const deviceRow = await queryOne<{ id: string }>(
        `SELECT d.id FROM device d WHERE d.user_id = $1 LIMIT 1`,
        [userId],
      );
      deviceId = deviceRow?.id;
    }
    try {
      await execute(
        `INSERT INTO user_profile (user_id, device_id, ${field}) VALUES ($1, $2, $3)`,
        [userId, deviceId ?? null, value],
      );
    } catch (e: any) {
      // 竞态：并发 INSERT 同一 user_id → 改为 UPDATE
      if (e.code === "23505") {
        const row = await findByUser(userId);
        if (row) {
          await execute(
            `UPDATE user_profile SET ${field} = $1, updated_at = now() WHERE id = $2`,
            [value, row.id],
          );
        }
      } else {
        throw e;
      }
    }
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
