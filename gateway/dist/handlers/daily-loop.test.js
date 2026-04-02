import { describe, it, expect } from "vitest";
/**
 * 测试 daily-loop 中 scheduled_start 的类型安全处理
 * 根因：PostgreSQL pg 驱动对 timestamp 列返回 Date 对象，
 * 代码假设是 string 调用 .startsWith() 导致 TypeError
 */
// 提取为独立可测试的工具函数
// 此函数将在实现阶段创建于 daily-loop.ts 中
import { toDateString } from "./daily-loop.js";
describe("toDateString — scheduled_start 类型安全转换", () => {
    it("should_return_iso_string_when_given_Date_object", () => {
        const date = new Date("2026-04-02T09:00:00Z");
        const result = toDateString(date);
        expect(result).toBe("2026-04-02T09:00:00.000Z");
    });
    it("should_return_string_as_is_when_given_string", () => {
        const result = toDateString("2026-04-02T09:00:00Z");
        expect(result).toBe("2026-04-02T09:00:00Z");
    });
    it("should_return_null_when_given_null", () => {
        expect(toDateString(null)).toBeNull();
    });
    it("should_return_null_when_given_undefined", () => {
        expect(toDateString(undefined)).toBeNull();
    });
    it("should_return_null_when_given_non_date_object", () => {
        expect(toDateString(123)).toBeNull();
        expect(toDateString({})).toBeNull();
    });
    it("should_enable_startsWith_filtering_for_Date_objects", () => {
        const todos = [
            { text: "A", scheduled_start: new Date("2026-04-02T09:00:00Z") },
            { text: "B", scheduled_start: new Date("2026-04-03T10:00:00Z") },
            { text: "C", scheduled_start: null },
            { text: "D", scheduled_start: "2026-04-02T14:00:00Z" },
        ];
        const today = "2026-04-02";
        const filtered = todos.filter((t) => toDateString(t.scheduled_start)?.startsWith(today));
        expect(filtered.map((t) => t.text)).toEqual(["A", "D"]);
    });
    it("should_handle_mixed_Date_and_string_types_in_same_array", () => {
        const todos = [
            { scheduled_start: new Date("2026-04-02T08:00:00Z") },
            { scheduled_start: "2026-04-02T12:00:00.000Z" },
            { scheduled_start: null },
        ];
        const today = "2026-04-02";
        const count = todos.filter((t) => toDateString(t.scheduled_start)?.startsWith(today)).length;
        expect(count).toBe(2);
    });
});
//# sourceMappingURL=daily-loop.test.js.map