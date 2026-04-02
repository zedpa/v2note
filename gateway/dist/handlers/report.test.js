import { describe, it, expect } from "vitest";
import { resolveMode, getPerspective } from "./report.js";
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
describe("getPerspective — 视角轮换", () => {
    it("should_return_accomplishment_for_monday", () => {
        const p = getPerspective(1); // 周一
        expect(p.name).toBe("成就感");
    });
    it("should_return_rhythm_for_tuesday", () => {
        const p = getPerspective(2); // 周二
        expect(p.name).toBe("节奏感");
    });
    it("should_return_growth_for_wednesday", () => {
        const p = getPerspective(3); // 周三
        expect(p.name).toBe("成长线");
    });
    it("should_return_connection_for_thursday", () => {
        const p = getPerspective(4); // 周四
        expect(p.name).toBe("连接感");
    });
    it("should_return_growth_for_sunday", () => {
        const p = getPerspective(0); // 周日
        expect(p.name).toBe("成长线");
    });
    it("should_always_have_name_and_instruction", () => {
        for (let i = 0; i <= 6; i++) {
            const p = getPerspective(i);
            expect(p.name).toBeTruthy();
            expect(p.instruction).toBeTruthy();
            expect(p.instruction.length).toBeGreaterThan(10);
        }
    });
});
//# sourceMappingURL=report.test.js.map