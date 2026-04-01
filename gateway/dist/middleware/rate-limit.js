/**
 * 基于 deviceId 的令牌桶速率限制
 */
const buckets = new Map();
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
 * @returns RateLimitResult，包含 allowed 和可选的 retryAfter（秒）
 */
export function checkRateLimit(deviceId, maxTokens = 5, refillRate = 5) {
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
        // 计算需要等待多少秒才能补充到 1 个 token
        const deficit = 1 - bucket.tokens;
        const retryAfter = Math.ceil(deficit / refillRate);
        return { allowed: false, retryAfter };
    }
    bucket.tokens -= 1;
    return { allowed: true };
}
/**
 * WebSocket 消息速率限制（每设备每秒 10 条）
 */
export function checkWsRateLimit(deviceId) {
    return checkRateLimit(`ws:${deviceId}`, 10, 10);
}
//# sourceMappingURL=rate-limit.js.map