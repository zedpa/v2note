/**
 * Optional OSS storage for audio PCM data.
 * Only active when OSS_* environment variables are set.
 */

let ossClient: any = null;

async function getClient() {
  if (ossClient) return ossClient;

  const region = process.env.OSS_REGION;
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET;

  if (!region || !accessKeyId || !accessKeySecret || !bucket) {
    throw new Error("OSS not configured");
  }

  // Dynamic import to avoid requiring ali-oss when not used
  const OSS = (await import("ali-oss")).default;
  ossClient = new OSS({
    region,
    accessKeyId,
    accessKeySecret,
    bucket,
  });
  return ossClient;
}

/**
 * Merge PCM chunks and upload to OSS.
 */
export async function uploadPCM(
  deviceId: string,
  chunks: Buffer[],
): Promise<string> {
  const client = await getClient();
  const combined = Buffer.concat(chunks);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `audio/${deviceId}/${timestamp}.pcm`;

  await client.put(path, combined);
  console.log(`[oss] Uploaded ${combined.length} bytes to ${path}`);
  return path;
}

/**
 * Upload a generic file (Buffer) to OSS. Returns the public URL.
 */
export async function uploadFile(
  folder: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const client = await getClient();
  const path = `${folder}/${filename}`;
  const result = await client.put(path, data);
  console.log(`[oss] Uploaded ${data.length} bytes to ${path}`);
  return result.url as string;
}

/**
 * Returns true if OSS environment variables are configured.
 */
export function isOssConfigured(): boolean {
  return !!(
    process.env.OSS_REGION &&
    process.env.OSS_ACCESS_KEY_ID &&
    process.env.OSS_ACCESS_KEY_SECRET &&
    process.env.OSS_BUCKET
  );
}
