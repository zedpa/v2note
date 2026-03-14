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
export declare function findLatest(platform: string, releaseType: string, currentVersionCode: number, nativeVersion?: string): Promise<AppRelease | null>;
export declare function findById(id: string): Promise<AppRelease | null>;
export declare function listAll(platform?: string): Promise<AppRelease[]>;
export declare function create(fields: {
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
}): Promise<AppRelease>;
export declare function setActive(id: string, active: boolean): Promise<AppRelease | null>;
export declare function update(id: string, fields: {
    bundle_url?: string;
    file_size?: number;
    checksum?: string;
    changelog?: string;
    is_mandatory?: boolean;
    is_active?: boolean;
    min_native_version?: string;
}): Promise<AppRelease | null>;
