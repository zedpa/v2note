import { describe, it, expect } from "vitest";
import { shouldTriggerMemory, MEMORY_TRIGGER_REGEX } from "./chat-memory-trigger.js";
describe("chat-memory-trigger", () => {
    // ── 场景 5.1: 关键词快筛 ──
    describe("shouldTriggerMemory", () => {
        // 显式记忆指令
        it("should_trigger_when_user_says_记住", () => {
            expect(shouldTriggerMemory("记住我喜欢早起")).toBe(true);
        });
        it("should_trigger_when_user_says_别忘了", () => {
            expect(shouldTriggerMemory("别忘了下周三开会")).toBe(true);
        });
        // 持久性规则设定
        it("should_trigger_when_user_says_以后都", () => {
            expect(shouldTriggerMemory("以后都用这种格式")).toBe(true);
        });
        it("should_trigger_when_user_says_永远不要", () => {
            expect(shouldTriggerMemory("永远不要给我推荐咖啡")).toBe(true);
        });
        it("should_trigger_when_user_says_从现在起", () => {
            expect(shouldTriggerMemory("从现在起每天提醒我喝水")).toBe(true);
        });
        it("should_trigger_when_user_says_必须", () => {
            expect(shouldTriggerMemory("你必须用中文回复")).toBe(true);
        });
        // 纠正/不满
        it("should_trigger_when_user_says_说了多少次了", () => {
            expect(shouldTriggerMemory("说了多少次了不要用英文")).toBe(true);
        });
        it("should_trigger_when_user_says_又这样", () => {
            expect(shouldTriggerMemory("又这样，我不需要这么详细")).toBe(true);
        });
        // 偏好声明
        it("should_trigger_when_user_says_我喜欢", () => {
            expect(shouldTriggerMemory("我喜欢简洁的回复")).toBe(true);
        });
        it("should_trigger_when_user_says_我讨厌", () => {
            expect(shouldTriggerMemory("我讨厌长篇大论")).toBe(true);
        });
        // 不触发
        it("should_not_trigger_for_normal_message", () => {
            expect(shouldTriggerMemory("今天天气不错")).toBe(false);
        });
        it("should_not_trigger_for_question", () => {
            expect(shouldTriggerMemory("帮我查一下明天有什么安排")).toBe(false);
        });
    });
    // ── 场景 5.2: 正则预编译 ──
    describe("MEMORY_TRIGGER_REGEX", () => {
        it("should_be_a_compiled_regex", () => {
            expect(MEMORY_TRIGGER_REGEX).toBeInstanceOf(RegExp);
        });
        it("should_match_efficiently_via_test", () => {
            // O(1) 匹配，不需要遍历
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                MEMORY_TRIGGER_REGEX.test("记住这个");
            }
            const elapsed = performance.now() - start;
            // 1000 次应在 10ms 内完成
            expect(elapsed).toBeLessThan(50);
        });
    });
});
//# sourceMappingURL=chat-memory-trigger.test.js.map