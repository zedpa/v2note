import { query, queryOne, execute } from "../pool.js";

export interface EmailVerification {
  id: string;
  email: string;
  code: string;
  purpose: "register" | "bind" | "reset_password";
  expires_at: string;
  attempts: number;
  used: boolean;
  created_at: string;
}

/** 创建验证码记录 */
export async function create(fields: {
  email: string;
  code: string;
  purpose: string;
  expires_at: Date;
}): Promise<EmailVerification> {
  const row = await queryOne<EmailVerification>(
    `INSERT INTO email_verification (email, code, purpose, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [fields.email, fields.code, fields.purpose, fields.expires_at.toISOString()],
  );
  return row!;
}

/** 查找该邮箱 + purpose 最近的未使用、未过期验证码 */
export async function findLatestUnused(
  email: string,
  purpose: string,
): Promise<EmailVerification | null> {
  return queryOne<EmailVerification>(
    `SELECT * FROM email_verification
     WHERE email = $1 AND purpose = $2 AND used = false AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [email, purpose],
  );
}

/** 查找该邮箱最近 60 秒内的验证码（防重复发送） */
export async function findRecentByEmail(email: string): Promise<EmailVerification | null> {
  return queryOne<EmailVerification>(
    `SELECT * FROM email_verification
     WHERE email = $1 AND created_at > now() - interval '60 seconds'
     ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
}

/** 增加尝试次数 */
export async function incrementAttempts(id: string): Promise<void> {
  await execute(
    `UPDATE email_verification SET attempts = attempts + 1 WHERE id = $1`,
    [id],
  );
}

/** 标记为已使用 */
export async function markUsed(id: string): Promise<void> {
  await execute(
    `UPDATE email_verification SET used = true WHERE id = $1`,
    [id],
  );
}
