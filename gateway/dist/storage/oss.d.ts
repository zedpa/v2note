/**
 * Optional OSS storage for audio PCM data.
 * Only active when OSS_* environment variables are set.
 */
/**
 * Merge PCM chunks and upload to OSS.
 */
export declare function uploadPCM(deviceId: string, chunks: Buffer[]): Promise<string>;
