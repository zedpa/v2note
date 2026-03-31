/**
 * 基于 deviceId 的令牌桶速率限制
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

// 每 5 分钟清理过期桶，防止内存泄漏
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const BUCKET_EXPIRE = 60 * 1000; // 60 秒无活动即清理

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > BUCKET_EXPIRE) {
      buckets.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * 检查是否允许请求
 * @returns true = 允许，false = 超限
 */
export function checkRateLimit(
  deviceId: string,
  maxTokens: number = 5,
  refillRate: number = 5, // 每秒补充数
): boolean {
  const now = Date.now();
  let bucket = buckets.get(deviceId);

  if (!bucket) {
    bucket = { tokens: maxTokens, lastRefill: now };
    buckets.set(deviceId, bucket);
  }

  // 补充 token
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    return false;
  }

  bucket.tokens -= 1;
  return true;
}

/**
 * WebSocket 消息速率限制（每设备每秒 10 条）
 */
export function checkWsRateLimit(deviceId: string): boolean {
  return checkRateLimit(`ws:${deviceId}`, 10, 10);
}
