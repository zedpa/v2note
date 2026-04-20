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
    region: region.startsWith("oss-") ? region : `oss-${region}`,
    accessKeyId,
    accessKeySecret,
    bucket,
  });
  return ossClient;
}

/**
 * Build a WAV header for 16-bit mono PCM at the given sample rate.
 */
function buildWavHeader(pcmLength: number, sampleRate = 16000): Buffer {
  const header = Buffer.alloc(44);
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmLength;
  const fileSize = 36 + dataSize;

  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return header;
}

/**
 * Merge PCM chunks, convert to WAV, upload to OSS. Returns the public URL.
 */
export async function uploadPCM(
  deviceId: string,
  chunks: Buffer[],
): Promise<string> {
  const client = await getClient();
  const pcmData = Buffer.concat(chunks);
  const wavHeader = buildWavHeader(pcmData.length);
  const wavBuffer = Buffer.concat([wavHeader, pcmData]);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `audio/${deviceId}/${timestamp}.wav`;

  const result = await client.put(path, wavBuffer);
  console.log(`[oss] Uploaded ${wavBuffer.length} bytes WAV to ${path}`);
  return result.url as string;
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
 * Signed URL 缓存（spec: fix-oss-image-traffic-storm.md）
 *
 * 解决：signatureUrl() 每次签出的 query 都不同，浏览器把它当作新 URL → HTTP 缓存失效
 * 方案：同一 objectPath 在签名过期前 5 分钟都返回同一字符串；
 *       缓存条目以 objectPath 为键，带 expiresAt 时间戳；命中时若距过期 > 5 分钟就复用。
 *
 * 进程内 Map 只在单实例部署时够用；多实例部署应改 Redis（外部注入 ISigningCache）。
 * 这里先落进程内，保留插拔点给后续接 Redis。
 */
const SIGN_TTL_SEC = 3600;          // OSS 签名有效期：1 小时
const SIGN_REFRESH_AHEAD_MS = 5 * 60 * 1000; // 过期前 5 分钟视为需要刷新

interface SignCacheEntry {
  url: string;
  expiresAt: number; // epoch ms
}

const signCache = new Map<string, SignCacheEntry>();

/** 测试桩：清空缓存 */
export function __clearSignCacheForTest(): void {
  signCache.clear();
}

/**
 * Generate a signed URL for a given OSS object path (valid for 1 hour).
 * 同一 objectPath 在 TTL 内返回相同字符串，保证浏览器 HTTP 缓存可用。
 */
export async function getSignedUrl(objectPath: string): Promise<string> {
  // 归一化出 key（接受 http URL 或裸 key）
  let key = objectPath;
  if (objectPath.startsWith("http")) {
    const url = new URL(objectPath);
    key = decodeURIComponent(url.pathname.replace(/^\//, ""));
  }

  const now = Date.now();
  const cached = signCache.get(key);
  if (cached && cached.expiresAt - now > SIGN_REFRESH_AHEAD_MS) {
    return cached.url;
  }

  const client = await getClient();
  const url = client.signatureUrl(key, { expires: SIGN_TTL_SEC }) as string;
  signCache.set(key, {
    url,
    expiresAt: now + SIGN_TTL_SEC * 1000,
  });
  return url;
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
