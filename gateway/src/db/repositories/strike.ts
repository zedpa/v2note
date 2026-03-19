import { query, queryOne, execute } from "../pool.js";

export interface StrikeEntry {
  id: string;
  user_id: string;
  nucleus: string;
  polarity: string;
  field: Record<string, any>;
  source_id: string | null;
  source_span: string | null;
  source_type: string | null;
  confidence: number;
  salience: number;
  status: string;
  superseded_by: string | null;
  is_cluster: boolean;
  created_at: string;
  digested_at: string | null;
}

export async function create(fields: {
  user_id: string;
  nucleus: string;
  polarity: string;
  field?: Record<string, any>;
  source_id?: string;
  source_span?: string;
  source_type?: string;
  confidence?: number;
  salience?: number;
  status?: string;
  is_cluster?: boolean;
}): Promise<StrikeEntry> {
  const row = await queryOne<StrikeEntry>(
    `INSERT INTO strike (user_id, nucleus, polarity, field, source_id, source_span, source_type, confidence, salience, status, is_cluster)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      fields.user_id,
      fields.nucleus,
      fields.polarity,
      JSON.stringify(fields.field ?? {}),
      fields.source_id ?? null,
      fields.source_span ?? null,
      fields.source_type ?? "voice",
      fields.confidence ?? 0.5,
      fields.salience ?? 1.0,
      fields.status ?? "active",
      fields.is_cluster ?? false,
    ],
  );
  return row!;
}

export async function findByUser(
  userId: string,
  opts?: { status?: string; polarity?: string; limit?: number },
): Promise<StrikeEntry[]> {
  const conditions = [`user_id = $1`];
  const params: any[] = [userId];
  let i = 2;
  if (opts?.status !== undefined) {
    conditions.push(`status = $${i++}`);
    params.push(opts.status);
  }
  if (opts?.polarity !== undefined) {
    conditions.push(`polarity = $${i++}`);
    params.push(opts.polarity);
  }
  const limit = opts?.limit ?? 100;
  return query<StrikeEntry>(
    `SELECT * FROM strike WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${i}`,
    [...params, limit],
  );
}

export async function findBySource(sourceId: string): Promise<StrikeEntry[]> {
  return query<StrikeEntry>(
    `SELECT * FROM strike WHERE source_id = $1 ORDER BY created_at ASC`,
    [sourceId],
  );
}

export async function findActive(
  userId: string,
  limit?: number,
): Promise<StrikeEntry[]> {
  return query<StrikeEntry>(
    `SELECT * FROM strike WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit ?? 100],
  );
}

export async function updateStatus(
  id: string,
  status: string,
  supersededBy?: string,
): Promise<void> {
  if (supersededBy) {
    await execute(
      `UPDATE strike SET status = $1, superseded_by = $2 WHERE id = $3`,
      [status, supersededBy, id],
    );
  } else {
    await execute(`UPDATE strike SET status = $1 WHERE id = $2`, [status, id]);
  }
}

export async function update(
  id: string,
  fields: {
    nucleus?: string;
    polarity?: string;
    field?: Record<string, any>;
    confidence?: number;
    salience?: number;
    status?: string;
    digested_at?: string;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (fields.nucleus !== undefined) {
    sets.push(`nucleus = $${i++}`);
    params.push(fields.nucleus);
  }
  if (fields.polarity !== undefined) {
    sets.push(`polarity = $${i++}`);
    params.push(fields.polarity);
  }
  if (fields.field !== undefined) {
    sets.push(`field = $${i++}`);
    params.push(JSON.stringify(fields.field));
  }
  if (fields.confidence !== undefined) {
    sets.push(`confidence = $${i++}`);
    params.push(fields.confidence);
  }
  if (fields.salience !== undefined) {
    sets.push(`salience = $${i++}`);
    params.push(fields.salience);
  }
  if (fields.status !== undefined) {
    sets.push(`status = $${i++}`);
    params.push(fields.status);
  }
  if (fields.digested_at !== undefined) {
    sets.push(`digested_at = $${i++}`);
    params.push(fields.digested_at);
  }
  if (sets.length === 0) return;
  params.push(id);
  await execute(
    `UPDATE strike SET ${sets.join(", ")} WHERE id = $${i}`,
    params,
  );
}
