import { query, queryOne } from "../pool.js";
/**
 * Find latest available update for a given platform/type newer than currentVersionCode.
 * For OTA releases, also checks min_native_version <= nativeVersion.
 */
export async function findLatest(platform, releaseType, currentVersionCode, nativeVersion) {
    if (releaseType === "ota" && nativeVersion) {
        return queryOne(`SELECT * FROM app_release
       WHERE platform = $1
         AND release_type = $2
         AND is_active = true
         AND version_code > $3
         AND (min_native_version IS NULL OR min_native_version <= $4)
       ORDER BY version_code DESC
       LIMIT 1`, [platform, releaseType, currentVersionCode, nativeVersion]);
    }
    return queryOne(`SELECT * FROM app_release
     WHERE platform = $1
       AND release_type = $2
       AND is_active = true
       AND version_code > $3
     ORDER BY version_code DESC
     LIMIT 1`, [platform, releaseType, currentVersionCode]);
}
export async function findById(id) {
    return queryOne(`SELECT * FROM app_release WHERE id = $1`, [id]);
}
export async function listAll(platform) {
    if (platform) {
        return query(`SELECT * FROM app_release WHERE platform = $1 ORDER BY version_code DESC`, [platform]);
    }
    return query(`SELECT * FROM app_release ORDER BY version_code DESC`);
}
export async function create(fields) {
    const row = await queryOne(`INSERT INTO app_release (version, version_code, platform, release_type, bundle_url, file_size, checksum, changelog, is_mandatory, min_native_version, published_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`, [
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
    ]);
    return row;
}
export async function setActive(id, active) {
    return queryOne(`UPDATE app_release SET is_active = $1 WHERE id = $2 RETURNING *`, [active, id]);
}
export async function update(id, fields) {
    const sets = [];
    const params = [];
    let idx = 1;
    if (fields.bundle_url !== undefined) {
        sets.push(`bundle_url = $${idx++}`);
        params.push(fields.bundle_url);
    }
    if (fields.file_size !== undefined) {
        sets.push(`file_size = $${idx++}`);
        params.push(fields.file_size);
    }
    if (fields.checksum !== undefined) {
        sets.push(`checksum = $${idx++}`);
        params.push(fields.checksum);
    }
    if (fields.changelog !== undefined) {
        sets.push(`changelog = $${idx++}`);
        params.push(fields.changelog);
    }
    if (fields.is_mandatory !== undefined) {
        sets.push(`is_mandatory = $${idx++}`);
        params.push(fields.is_mandatory);
    }
    if (fields.is_active !== undefined) {
        sets.push(`is_active = $${idx++}`);
        params.push(fields.is_active);
    }
    if (fields.min_native_version !== undefined) {
        sets.push(`min_native_version = $${idx++}`);
        params.push(fields.min_native_version);
    }
    if (sets.length === 0)
        return findById(id);
    params.push(id);
    return queryOne(`UPDATE app_release SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, params);
}
//# sourceMappingURL=app-release.js.map