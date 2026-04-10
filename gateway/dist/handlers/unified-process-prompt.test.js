import { describe, it, expect } from "vitest";
import { buildUnifiedProcessPrompt } from "./unified-process-prompt.js";
const ctx = {
    activeGoals: [],
    pendingTodos: [],
    existingDomains: [],
};
describe("buildUnifiedProcessPrompt", () => {
    const prompt = buildUnifiedProcessPrompt(ctx);
    it("should_default_to_record_intent_type", () => {
        expect(prompt).toContain("**record**（默认）");
        expect(prompt).toContain("绝大部分情况都是 record");
    });
    it("should_not_contain_mixed_intent_type", () => {
        // mixed 已废弃
        expect(prompt).not.toContain("**mixed**");
    });
    it("should_only_allow_create_todo_and_modify_todo_commands", () => {
        expect(prompt).toContain("create_todo: 创建新待办");
        expect(prompt).toContain("modify_todo: 修改已有待办");
        // 不应作为可用指令列出 complete_todo 和 query_todo
        expect(prompt).toContain("不支持 complete_todo 和 query_todo");
        // 可用指令部分不应有 complete_todo 的定义行
        expect(prompt).not.toContain("complete_todo: ");
        expect(prompt).not.toContain("query_todo: ");
    });
    it("should_emphasize_record_is_default_in_constraints", () => {
        expect(prompt).toContain("intent_type 绝大部分情况是 \"record\"");
    });
    it("should_require_action_only_for_pure_commands", () => {
        expect(prompt).toContain("完全**在下直接操作指令");
        expect(prompt).toContain("有叙述就是 record");
    });
});
//# sourceMappingURL=unified-process-prompt.test.js.map