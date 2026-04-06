import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock repositories
vi.mock("../../db/repositories/index.js", () => ({
    recordRepo: {
        findById: vi.fn(),
    },
    transcriptRepo: {
        findByRecordId: vi.fn(),
    },
    summaryRepo: {
        findByRecordId: vi.fn(),
    },
    todoRepo: {
        findById: vi.fn(),
        findSubtasks: vi.fn(),
    },
    goalRepo: {
        findById: vi.fn(),
        findWithTodos: vi.fn(),
    },
}));
import { viewRecordTool } from "./view-record.js";
import { viewTodoTool } from "./view-todo.js";
import { viewGoalTool } from "./view-goal.js";
import { recordRepo, transcriptRepo, summaryRepo, todoRepo, goalRepo } from "../../db/repositories/index.js";
const CTX = { deviceId: "dev-1", userId: "user-1", sessionId: "s-1" };
describe("view_record", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    it("should_return_full_content_when_record_exists", async () => {
        vi.mocked(recordRepo.findById).mockResolvedValue({
            id: "rec-1", device_id: "dev-1", user_id: "user-1", source: "voice",
            domain: "工作/v2note", created_at: "2026-04-06T10:00:00Z",
        });
        vi.mocked(transcriptRepo.findByRecordId).mockResolvedValue({
            text: "今天开会讨论了产品方向", record_id: "rec-1",
        });
        vi.mocked(summaryRepo.findByRecordId).mockResolvedValue({
            title: "产品方向讨论", record_id: "rec-1",
        });
        const result = await viewRecordTool.handler({ record_id: "rec-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.title).toBe("产品方向讨论");
        expect(result.data.content).toBe("今天开会讨论了产品方向");
        expect(result.data.domain).toBe("工作/v2note");
        expect(result.data.truncated).toBe(false);
        expect(result.data.word_count).toBe(11);
    });
    it("should_fail_when_record_not_found", async () => {
        vi.mocked(recordRepo.findById).mockResolvedValue(null);
        const result = await viewRecordTool.handler({ record_id: "nonexistent" }, CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("不存在");
    });
    it("should_fail_when_user_has_no_access", async () => {
        vi.mocked(recordRepo.findById).mockResolvedValue({
            id: "rec-2", device_id: "other-dev", user_id: "other-user",
        });
        const result = await viewRecordTool.handler({ record_id: "rec-2" }, CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("无权");
    });
    it("should_truncate_when_content_exceeds_5000_chars", async () => {
        vi.mocked(recordRepo.findById).mockResolvedValue({
            id: "rec-1", device_id: "dev-1", user_id: "user-1", source: "text",
            domain: null, created_at: "2026-04-06T10:00:00Z",
        });
        const longText = "a".repeat(6000);
        vi.mocked(transcriptRepo.findByRecordId).mockResolvedValue({
            text: longText, record_id: "rec-1",
        });
        vi.mocked(summaryRepo.findByRecordId).mockResolvedValue(null);
        const result = await viewRecordTool.handler({ record_id: "rec-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.truncated).toBe(true);
        expect(result.data.word_count).toBe(6000);
        expect(result.data.content.length).toBe(5000);
    });
    it("should_return_empty_content_when_no_transcript", async () => {
        vi.mocked(recordRepo.findById).mockResolvedValue({
            id: "rec-1", device_id: "dev-1", user_id: "user-1", source: "text",
            domain: null, created_at: "2026-04-06T10:00:00Z",
        });
        vi.mocked(transcriptRepo.findByRecordId).mockResolvedValue(null);
        vi.mocked(summaryRepo.findByRecordId).mockResolvedValue(null);
        const result = await viewRecordTool.handler({ record_id: "rec-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.content).toBe("");
        expect(result.data.word_count).toBe(0);
    });
    it("should_have_silent_autonomy", () => {
        expect(viewRecordTool.autonomy).toBe("silent");
    });
});
describe("view_todo", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    it("should_return_todo_details_with_subtasks_when_exists", async () => {
        vi.mocked(todoRepo.findById).mockResolvedValue({
            id: "todo-1", text: "写周报", done: false, priority: 3,
            scheduled_start: "2026-04-06T15:00:00Z", scheduled_end: null,
            estimated_minutes: 30, parent_id: "goal-1", record_id: "rec-1",
            user_id: "user-1", device_id: "dev-1", created_at: "2026-04-06T10:00:00Z",
        });
        vi.mocked(todoRepo.findSubtasks).mockResolvedValue([
            { id: "sub-1", text: "收集数据", done: true },
            { id: "sub-2", text: "写总结", done: false },
        ]);
        const result = await viewTodoTool.handler({ todo_id: "todo-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.text).toBe("写周报");
        expect(result.data.done).toBe(false);
        expect(result.data.subtasks).toHaveLength(2);
        expect(result.data.parent_id).toBe("goal-1");
    });
    it("should_fail_when_todo_not_found", async () => {
        vi.mocked(todoRepo.findById).mockResolvedValue(null);
        const result = await viewTodoTool.handler({ todo_id: "nonexistent" }, CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("不存在");
    });
    it("should_fail_when_user_has_no_access", async () => {
        vi.mocked(todoRepo.findById).mockResolvedValue({
            id: "todo-2", user_id: "other-user", device_id: "other-dev",
        });
        const result = await viewTodoTool.handler({ todo_id: "todo-2" }, CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("无权");
    });
    it("should_return_completed_todo_normally", async () => {
        vi.mocked(todoRepo.findById).mockResolvedValue({
            id: "todo-3", text: "已完成任务", done: true, priority: 0,
            user_id: "user-1", device_id: "dev-1", created_at: "2026-04-01T10:00:00Z",
        });
        vi.mocked(todoRepo.findSubtasks).mockResolvedValue([]);
        const result = await viewTodoTool.handler({ todo_id: "todo-3" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.done).toBe(true);
    });
    it("should_have_silent_autonomy", () => {
        expect(viewTodoTool.autonomy).toBe("silent");
    });
});
describe("view_goal", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    it("should_return_goal_details_with_todo_stats_when_exists", async () => {
        vi.mocked(goalRepo.findById).mockResolvedValue({
            id: "goal-1", title: "学习 Rust", status: "active",
            device_id: "dev-1", user_id: "user-1", parent_id: null,
            source: "speech", created_at: "2026-03-01T10:00:00Z",
        });
        vi.mocked(goalRepo.findWithTodos).mockResolvedValue([
            { id: "t-1", text: "看文档", done: true },
            { id: "t-2", text: "写练习", done: false },
            { id: "t-3", text: "做项目", done: false },
        ]);
        const result = await viewGoalTool.handler({ goal_id: "goal-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.title).toBe("学习 Rust");
        expect(result.data.status).toBe("active");
        expect(result.data.todo_stats).toEqual({ active: 2, completed: 1 });
        expect(result.data.todos).toHaveLength(3);
    });
    it("should_fail_when_goal_not_found", async () => {
        vi.mocked(goalRepo.findById).mockResolvedValue(null);
        const result = await viewGoalTool.handler({ goal_id: "nonexistent" }, CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("不存在");
    });
    it("should_fail_when_user_has_no_access", async () => {
        vi.mocked(goalRepo.findById).mockResolvedValue({
            id: "goal-2", device_id: "other-dev", user_id: "other-user",
        });
        const result = await viewGoalTool.handler({ goal_id: "goal-2" }, CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("无权");
    });
    it("should_limit_todos_to_20", async () => {
        vi.mocked(goalRepo.findById).mockResolvedValue({
            id: "goal-1", title: "大目标", status: "active",
            device_id: "dev-1", user_id: "user-1",
        });
        const manyTodos = Array.from({ length: 25 }, (_, i) => ({
            id: `t-${i}`, text: `任务${i}`, done: false,
        }));
        vi.mocked(goalRepo.findWithTodos).mockResolvedValue(manyTodos);
        const result = await viewGoalTool.handler({ goal_id: "goal-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.todos).toHaveLength(20);
        expect(result.data.todo_stats).toEqual({ active: 25, completed: 0 });
    });
    it("should_have_silent_autonomy", () => {
        expect(viewGoalTool.autonomy).toBe("silent");
    });
});
//# sourceMappingURL=view-tools.test.js.map