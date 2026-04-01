/**
 * 基于 deviceId 的令牌桶速率限制
 */
export interface RateLimitResult {
    allowed: boolean;
    retryAfter?: number;
}
/**
 * 检查是否允许请求
 * @returns RateLimitResult，包含 allowed 和可选的 retryAfter（秒）
 */
export declare function checkRateLimit(deviceId: string, maxTokens?: number, refillRate?: number): RateLimitResult;
/**
 * WebSocket 消息速率限制（每设备每秒 10 条）
 */
export declare function checkWsRateLimit(deviceId: string): RateLimitResult;
