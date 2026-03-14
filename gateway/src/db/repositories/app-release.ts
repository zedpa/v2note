import { query, queryOne, execute } from "../pool.js";

export interface AppRelease {
  id: string;
  version: string;
  version_code: number;
  platform: string;
  release_type: string;
  bundle_url: string | null;
  file_size: number | null;
  checksum: string | null;
  changelog: string | null;
  is_mandatory: boolean;
  is_active: boolean;
  min_native_version: string | null;
  published_by: string | null;
  created_at: string;
}

/**
 * Find latest available update for a given platform/type newer than currentVersionCode.
 * For OTA releases, also checks min_native_version <= nativeVersion.
 */
export async function findLatest(
  platform: string,
  releaseType: string,
  currentVersionCode: number,
  nativeVersion?: string,
): Promise<AppRelease | null> {
  if (releaseType === "ota" && nativeVersion) {
    return queryOne<AppRelease>(
      `SELECT * FROM app_release
       WHERE platform = $1
         AND release_type = $2
         AND is_active = true
         AND version_code > $3
         AND (min_native_version IS NULL OR min_native_version <= $4)
       ORDER BY version_code DESC
       LIMIT 1`,
      [platform, releaseType, currentVersionCode, nativeVersion],
    );
  }
  return queryOne<AppRelease>(
    `SELECT * FROM app_release
     WHERE platform = $1
       AND release_type = $2
       AND is_active = true
       AND version_code > $3
     ORDER BY version_code DESC
     LIMIT 1`,
    [platform, releaseType, currentVersionCode],
  );
}

export async function findById(id: string): Promise<AppRelease | null> {
  return queryOne<AppRelease>(`SELECT * FROM app_release WHERE id = $1`, [id]);
}

export async function listAll(platform?: string): Promise<AppRelease[]> {
  if (platform) {
    return query<AppRelease>(
      `SELECT * FROM app_release WHERE platform = $1 ORDER BY version_code DESC`,
      [platform],
    );
  }
  return query<AppRelease>(
    `SELECT * FROM app_release ORDER BY version_code DESC`,
  );
}

export async function create(fields: {
  version: string;
  version_code: number;
  platform?: string;
  release_type: string;
  bundle_url?: string;
  file_size?: number;
  checksum?: string;
  changelog?: string;
  is_mandatory?: boolean;
  min_native_version?: string;
  published_by?: string;
}): Promise<AppRelease> {
  const row = await queryOne<AppRelease>(
    `INSERT INTO app_release (version, version_code, platform, release_type, bundle_url, file_size, checksum, changelog, is_mandatory, min_native_version, published_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      fields.version,
      fields.version_code,
      fields.platform ?? "android",
      fields.release_type,
      fields.bundle_url ?? null,
      fields.file_size ?? null,
      fields.checksum ?? null,
      fields.changelog ?? null,
      fields.is_mandatory ?? false,
      fields.min_native_version ?? null,
      fields.published_by ?? null,
    ],
  );
  return row!;
}

export async function setActive(id: string, active: boolean): Promise<AppRelease | null> {
  return queryOne<AppRelease>(
    `UPDATE app_release SET is_active = $1 WHERE id = $2 RETURNING *`,
    [active, id],
  );
}

export async function update(
  id: string,
  fields: {
    bundle_url?: string;
    file_size?: number;
    checksum?: string;
    changelog?: string;
    is_mandatory?: boolean;
    is_active?: boolean;
    min_native_version?: string;
  },
): Promise<AppRelease | null> {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (fields.bundle_url !== undefined) { sets.push(`bundle_url = $${idx++}`); params.push(fields.bundle_url); }
  if (fields.file_size !== undefined) { sets.push(`file_size = $${idx++}`); params.push(fields.file_size); }
  if (fields.checksum !== undefined) { sets.push(`checksum = $${idx++}`); params.push(fields.checksum); }
  if (fields.changelog !== undefined) { sets.push(`changelog = $${idx++}`); params.push(fields.changelog); }
  if (fields.is_mandatory !== undefined) { sets.push(`is_mandatory = $${idx++}`); params.push(fields.is_mandatory); }
  if (fields.is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(fields.is_active); }
  if (fields.min_native_version !== undefined) { sets.push(`min_native_version = $${idx++}`); params.push(fields.min_native_version); }
  if (sets.length === 0) return findById(id);
  params.push(id);
  return queryOne<AppRelease>(
    `UPDATE app_release SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params,
  );
}
