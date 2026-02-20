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
