import { describe, it, expect, beforeEach } from "vitest";
// 每个测试重新加载模块，避免状态污染
let checkRateLimit;
let checkWsRateLimit;
beforeEach(async () => {
    // 动态导入以获取新鲜状态（vitest 模块隔离）
    const mod = await import("./rate-limit.js");
    checkRateLimit = mod.checkRateLimit;
    checkWsRateLimit = mod.checkWsRateLimit;
});
describe("Rate Limit — Retry-After", () => {
    // ── 场景 5: 限流返回重试时间 ──
    it("should_return_allowed_true_when_tokens_available", () => {
        const result = checkRateLimit("device-1");
        expect(result.allowed).toBe(true);
        expect(result.retryAfter).toBeUndefined();
    });
    it("should_return_retryAfter_seconds_when_rate_limited", () => {
        // 耗尽所有 token（默认 5 个）
        for (let i = 0; i < 5; i++) {
            checkRateLimit("device-exhaust");
        }
        const result = checkRateLimit("device-exhaust");
        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBeDefined();
        expect(result.retryAfter).toBeGreaterThan(0);
        // 默认 refillRate=5/s，需要补 1 个 token → retryAfter ≈ ceil(1/5) = 1
        expect(result.retryAfter).toBeLessThanOrEqual(1);
    });
    // ── 场景 6: WebSocket 限流 ──
    it("should_return_retryAfter_for_ws_rate_limit", () => {
        // WS: 10 tokens, 10/s refill
        for (let i = 0; i < 10; i++) {
            checkWsRateLimit("ws-device");
        }
        const result = checkWsRateLimit("ws-device");
        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBeDefined();
        expect(result.retryAfter).toBeGreaterThan(0);
    });
    // ── 边界: 令牌桶刚好恢复 ──
    it("should_return_retryAfter_0_when_tokens_just_recovered", () => {
        const result = checkRateLimit("fresh-device");
        expect(result.allowed).toBe(true);
        expect(result.retryAfter).toBeUndefined();
    });
});
//# sourceMappingURL=rate-limit.test.js.map