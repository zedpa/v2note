import { query, queryOne, execute } from "../pool.js";
import { createHash } from "node:crypto";

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  device_id: string | null;
  expires_at: string;
  created_at: string;
}

/** Hash a raw token for storage */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function create(fields: {
  user_id: string;
  token_hash: string;
  device_id?: string;
  expires_at: Date;
}): Promise<RefreshToken> {
  const row = await queryOne<RefreshToken>(
    `INSERT INTO refresh_token (user_id, token_hash, device_id, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [fields.user_id, fields.token_hash, fields.device_id ?? null, fields.expires_at.toISOString()],
  );
  return row!;
}

export async function findByHash(tokenHash: string): Promise<RefreshToken | null> {
  return queryOne<RefreshToken>(
    `SELECT * FROM refresh_token WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash],
  );
}

export async function deleteByHash(tokenHash: string): Promise<void> {
  await execute(`DELETE FROM refresh_token WHERE token_hash = $1`, [tokenHash]);
}

export async function deleteByUser(userId: string): Promise<void> {
  await execute(`DELETE FROM refresh_token WHERE user_id = $1`, [userId]);
}
