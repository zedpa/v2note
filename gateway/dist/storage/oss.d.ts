/**
 * Optional OSS storage for audio PCM data.
 * Only active when OSS_* environment variables are set.
 */
/**
 * Merge PCM chunks, convert to WAV, upload to OSS. Returns the public URL.
 */
export declare function uploadPCM(deviceId: string, chunks: Buffer[]): Promise<string>;
/**
 * Upload a generic file (Buffer) to OSS. Returns the public URL.
 */
export declare function uploadFile(folder: string, filename: string, data: Buffer): Promise<string>;
/**
 * Generate a signed URL for a given OSS object path (valid for 1 hour).
 */
export declare function getSignedUrl(objectPath: string): Promise<string>;
/**
 * Returns true if OSS environment variables are configured.
 */
export declare function isOssConfigured(): boolean;
