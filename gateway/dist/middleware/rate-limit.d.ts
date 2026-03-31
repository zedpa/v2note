/**
 * 基于 deviceId 的令牌桶速率限制
 */
/**
 * 检查是否允许请求
 * @returns true = 允许，false = 超限
 */
export declare function checkRateLimit(deviceId: string, maxTokens?: number, refillRate?: number): boolean;
/**
 * WebSocket 消息速率限制（每设备每秒 10 条）
 */
export declare function checkWsRateLimit(deviceId: string): boolean;
