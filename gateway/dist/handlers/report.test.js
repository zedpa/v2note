import { describe, it, expect } from "vitest";
import { resolveMode } from "./report.js";
describe("resolveMode — 时段自动路由", () => {
    it("should_return_morning_for_6am", () => {
        expect(resolveMode(6)).toBe("morning");
    });
    it("should_return_morning_for_noon", () => {
        expect(resolveMode(12)).toBe("morning");
    });
    it("should_return_morning_for_1pm", () => {
        expect(resolveMode(13)).toBe("morning");
    });
    it("should_return_evening_for_2pm", () => {
        expect(resolveMode(14)).toBe("evening");
    });
    it("should_return_evening_for_9pm", () => {
        expect(resolveMode(21)).toBe("evening");
    });
    it("should_return_evening_for_midnight", () => {
        expect(resolveMode(0)).toBe("evening");
    });
    it("should_return_evening_for_5am", () => {
        expect(resolveMode(5)).toBe("evening");
    });
});
//# sourceMappingURL=report.test.js.map