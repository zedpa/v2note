import { query, queryOne } from "../pool.js";

export interface AppUser {
  id: string;
  phone: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
}

export async function findById(id: string): Promise<AppUser | null> {
  return queryOne<AppUser>(`SELECT * FROM app_user WHERE id = $1`, [id]);
}

export async function findByPhone(phone: string): Promise<AppUser | null> {
  return queryOne<AppUser>(`SELECT * FROM app_user WHERE phone = $1`, [phone]);
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
