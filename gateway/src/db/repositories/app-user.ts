import { query, queryOne, execute } from "../pool.js";

export interface AppUser {
  id: string;
  phone: string | null;
  email: string | null;
  password_hash: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export async function findById(id: string): Promise<AppUser | null> {
  return queryOne<AppUser>(`SELECT * FROM app_user WHERE id = $1`, [id]);
}

export async function findByPhone(phone: string): Promise<AppUser | null> {
  return queryOne<AppUser>(`SELECT * FROM app_user WHERE phone = $1`, [phone]);
}

export async function findByEmail(email: string): Promise<AppUser | null> {
  return queryOne<AppUser>(`SELECT * FROM app_user WHERE email = $1`, [email.toLowerCase()]);
}

export async function create(fields: {
  phone: string;
  password_hash: string;
  display_name?: string;
}): Promise<AppUser> {
  const row = await queryOne<AppUser>(
    `INSERT INTO app_user (phone, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING *`,
    [fields.phone, fields.password_hash, fields.display_name ?? null],
  );
  return row!;
}

/** 邮箱注册创建用户（phone 为 NULL） */
export async function createWithEmail(fields: {
  email: string;
  password_hash: string;
  display_name?: string;
}): Promise<AppUser> {
  const row = await queryOne<AppUser>(
    `INSERT INTO app_user (email, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING *`,
    [fields.email.toLowerCase(), fields.password_hash, fields.display_name ?? null],
  );
  return row!;
}

/** 更新密码 */
export async function updatePassword(userId: string, passwordHash: string): Promise<void> {
  await execute(
    `UPDATE app_user SET password_hash = $1 WHERE id = $2`,
    [passwordHash, userId],
  );
}

/** 绑定/更新邮箱 */
export async function updateEmail(userId: string, email: string): Promise<AppUser> {
  const row = await queryOne<AppUser>(
    `UPDATE app_user SET email = $1 WHERE id = $2 RETURNING *`,
    [email.toLowerCase(), userId],
  );
  return row!;
}

/** 更新个人资料（昵称、头像） */
export async function updateProfile(
  userId: string,
  fields: { display_name?: string; avatar_url?: string },
): Promise<AppUser> {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (fields.display_name !== undefined) {
    sets.push(`display_name = $${idx++}`);
    params.push(fields.display_name);
  }
  if (fields.avatar_url !== undefined) {
    sets.push(`avatar_url = $${idx++}`);
    params.push(fields.avatar_url);
  }

  if (sets.length === 0) {
    return (await findById(userId))!;
  }

  params.push(userId);
  const row = await queryOne<AppUser>(
    `UPDATE app_user SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params,
  );
  return row!;
}
