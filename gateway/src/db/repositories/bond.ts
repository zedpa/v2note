import { query, queryOne, execute } from "../pool.js";

export interface BondEntry {
  id: string;
  source_strike_id: string;
  target_strike_id: string;
  type: string;
  strength: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function create(fields: {
  source_strike_id: string;
  target_strike_id: string;
  type: string;
  strength?: number;
  created_by?: string;
}): Promise<BondEntry> {
  const row = await queryOne<BondEntry>(
    `INSERT INTO bond (source_strike_id, target_strike_id, type, strength, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      fields.source_strike_id,
      fields.target_strike_id,
      fields.type,
      fields.strength ?? 0.5,
      fields.created_by ?? "digest",
    ],
  );
  return row!;
}

export async function createMany(
  bonds: {
    source_strike_id: string;
    target_strike_id: string;
    type: string;
    strength?: number;
    created_by?: string;
  }[],
): Promise<BondEntry[]> {
  if (bonds.length === 0) return [];
  const values: string[] = [];
  const params: any[] = [];
  let i = 1;
  for (const b of bonds) {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    params.push(
      b.source_strike_id,
      b.target_strike_id,
      b.type,
      b.strength ?? 0.5,
      b.created_by ?? "digest",
    );
  }
  return query<BondEntry>(
    `INSERT INTO bond (source_strike_id, target_strike_id, type, strength, created_by)
     VALUES ${values.join(", ")} RETURNING *`,
    params,
  );
}

export async function findByStrike(strikeId: string): Promise<BondEntry[]> {
  return query<BondEntry>(
    `SELECT * FROM bond WHERE source_strike_id = $1 OR target_strike_id = $1
     ORDER BY created_at DESC`,
    [strikeId],
  );
}

export async function findByType(
  userId: string,
  type: string,
  limit?: number,
): Promise<BondEntry[]> {
  return query<BondEntry>(
    `SELECT b.* FROM bond b
     JOIN strike s ON s.id = b.source_strike_id
     WHERE s.user_id = $1 AND b.type = $2
     ORDER BY b.created_at DESC LIMIT $3`,
    [userId, type, limit ?? 100],
  );
}

export async function updateStrength(
  id: string,
  strength: number,
): Promise<void> {
  await execute(
    `UPDATE bond SET strength = $1, updated_at = now() WHERE id = $2`,
    [strength, id],
  );
}
