/**
 * domain_vocabulary CRUD — 领域词汇表管理
 */

import { query, queryOne, execute } from "../pool.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface VocabularyEntry {
  id: string;
  device_id: string;
  user_id: string | null;
  term: string;
  aliases: string[];
  domain: string;
  frequency: number;
  source: "preset" | "user" | "auto";
  created_at: string;
}

export interface CreateVocabularyInput {
  deviceId: string;
  userId?: string | null;
  term: string;
  aliases?: string[];
  domain: string;
  source?: "preset" | "user" | "auto";
}

// ── Read ───────────────────────────────────────────────────────────────

/** 按设备查询所有词汇 */
export async function findByDevice(deviceId: string): Promise<VocabularyEntry[]> {
  return query<VocabularyEntry>(
    `SELECT * FROM domain_vocabulary WHERE device_id = $1 ORDER BY domain, term`,
    [deviceId],
  );
}

/** 按用户查询所有词汇 */
export async function findByUser(userId: string): Promise<VocabularyEntry[]> {
  return query<VocabularyEntry>(
    `SELECT * FROM domain_vocabulary WHERE user_id = $1 ORDER BY domain, term`,
    [userId],
  );
}

/** 搜索 aliases 数组中包含指定文本的词条（精确匹配 ANY） */
export async function findByAliases(deviceId: string, text: string): Promise<VocabularyEntry[]> {
  return query<VocabularyEntry>(
    `SELECT * FROM domain_vocabulary WHERE device_id = $1 AND $2 = ANY(aliases)`,
    [deviceId, text],
  );
}

// ── Write ──────────────────────────────────────────────────────────────

/** 创建词汇条目 */
export async function create(input: CreateVocabularyInput): Promise<VocabularyEntry> {
  const row = await queryOne<VocabularyEntry>(
    `INSERT INTO domain_vocabulary (device_id, user_id, term, aliases, domain, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.deviceId,
      input.userId ?? null,
      input.term,
      input.aliases ?? [],
      input.domain,
      input.source ?? "user",
    ],
  );
  return row!;
}

/** 删除词汇条目 */
export async function deleteById(id: string): Promise<number> {
  return execute(
    `DELETE FROM domain_vocabulary WHERE id = $1`,
    [id],
  );
}

/** 删除词汇条目（校验所有权：属于该用户或该设备） */
export async function deleteByIdOwned(id: string, deviceId: string, userId?: string | null): Promise<number> {
  return execute(
    `DELETE FROM domain_vocabulary
     WHERE id = $1 AND (device_id = $2 OR ($3::uuid IS NOT NULL AND user_id = $3))`,
    [id, deviceId, userId ?? null],
  );
}

/** 增加使用频率 */
export async function incrementFrequency(id: string): Promise<void> {
  await execute(
    `UPDATE domain_vocabulary SET frequency = frequency + 1 WHERE id = $1`,
    [id],
  );
}
