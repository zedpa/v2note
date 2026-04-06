import { describe, it, expect, vi, afterEach } from "vitest";
import { getCurrentTimeTool } from "./get-current-time.js";
const CTX = { deviceId: "dev-1", userId: "user-1", sessionId: "s-1" };
describe("get_current_time", () => {
    afterEach(() => { vi.useRealTimers(); });
    it("should_return_current_time_info_when_called", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-06T15:42:00+08:00"));
        const result = await getCurrentTimeTool.handler({}, CTX);
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data.weekday).toBe("周一");
        expect(result.data.iso).toBeDefined();
        expect(result.data.timestamp).toBeTypeOf("number");
        expect(result.data.timezone).toBeTypeOf("string");
        expect(result.data.formatted).toContain("2026年4月6日");
    });
    it("should_return_correct_weekday_when_sunday", async () => {
        vi.useFakeTimers();
        // 2026-04-05 is Sunday
        vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));
        const result = await getCurrentTimeTool.handler({}, CTX);
        expect(result.data.weekday).toBe("周日");
    });
    it("should_have_silent_autonomy", () => {
        expect(getCurrentTimeTool.autonomy).toBe("silent");
    });
    it("should_accept_empty_parameters", () => {
        const parsed = getCurrentTimeTool.parameters.safeParse({});
        expect(parsed.success).toBe(true);
    });
});
//# sourceMappingURL=get-current-time.test.js.map