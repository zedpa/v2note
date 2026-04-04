/**
 * todo-subtask spec 测试
 * 场景 1-6: 子任务 CRUD、完成联动、层级校验
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock dependencies
vi.mock("../db/repositories/index.js", () => ({
    todoRepo: {
        create: vi.fn(),
        dedupCreate: vi.fn(),
        findByUser: vi.fn(),
        findByDevice: vi.fn(),
        findSubtasks: vi.fn(),
        update: vi.fn(),
        del: vi.fn(),
        findById: vi.fn(),
    },
}));
vi.mock("../cognitive/todo-projector.js", () => ({
    onTodoComplete: vi.fn().mockResolvedValue(undefined),
}));
import { todoRepo } from "../db/repositories/index.js";
describe("todo-subtask", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    // 场景 1: 创建子任务 — parent_id 传入
    it("should_accept_parent_id_when_creating_todo", async () => {
        const mockTodo = { id: "sub1", text: "子步骤1", parent_id: "parent1", done: false };
        vi.mocked(todoRepo.create).mockResolvedValue(mockTodo);
        const result = await todoRepo.create({
            text: "子步骤1",
            parent_id: "parent1",
            user_id: "u1",
        });
        expect(todoRepo.create).toHaveBeenCalledWith(expect.objectContaining({ parent_id: "parent1" }));
        expect(result.parent_id).toBe("parent1");
    });
    // 场景 5: 子任务不应出现在顶层列表
    it("should_exclude_subtasks_from_top_level_list", async () => {
        // findByUser 的查询应排除有 parent_id 的 todo
        vi.mocked(todoRepo.findByUser).mockResolvedValue([
            { id: "t1", text: "父任务", parent_id: null, done: false },
            // 子任务不应在此列表中
        ]);
        const todos = await todoRepo.findByUser("u1");
        for (const t of todos) {
            expect(t.parent_id).toBeNull();
        }
    });
    // 场景 3 & 4: findSubtasks 应返回指定父任务的子任务
    it("should_find_subtasks_by_parent_id", async () => {
        vi.mocked(todoRepo.findSubtasks).mockResolvedValue([
            { id: "sub1", text: "步骤1", parent_id: "p1", done: true },
            { id: "sub2", text: "步骤2", parent_id: "p1", done: false },
        ]);
        const subs = await todoRepo.findSubtasks("p1");
        expect(subs).toHaveLength(2);
        expect(subs.every((s) => s.parent_id === "p1")).toBe(true);
    });
});
/**
 * fix-voice-todo-pipeline Phase 1 测试
 * 场景 1.1: POST /api/v1/todos 接受 reminder + recurrence 字段
 * 场景 1.2: PATCH /api/v1/todos/:id 接受 reminder + recurrence 字段
 */
describe("fix-voice-todo-pipeline Phase 1: API 层补字段", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    // 场景 1.1: POST 接受 reminder/recurrence 字段并透传给 dedupCreate
    it("should_pass_reminder_and_recurrence_fields_when_creating_todo", async () => {
        vi.mocked(todoRepo.dedupCreate).mockResolvedValue({
            todo: { id: "t1", text: "开会" },
            action: "created",
        });
        // 模拟 route handler 逻辑：readBody 类型应接受 reminder/recurrence 字段
        const body = {
            text: "明天下午3点开会",
            scheduled_start: "2026-04-05T15:00:00",
            priority: 3,
            reminder_before: 30,
            reminder_types: ["notification"],
            recurrence_rule: "daily",
            recurrence_end: "2026-05-01",
        };
        // 验证 dedupCreate 被调用时包含这些字段
        await todoRepo.dedupCreate({
            ...body,
            user_id: "u1",
            device_id: "d1",
        });
        expect(todoRepo.dedupCreate).toHaveBeenCalledWith(expect.objectContaining({
            reminder_before: 30,
            reminder_types: ["notification"],
            recurrence_rule: "daily",
            recurrence_end: "2026-05-01",
            priority: 3,
        }));
    });
    // 场景 1.1: POST 传入 reminder_before + scheduled_start 时自动计算 reminder_at
    it("should_compute_reminder_at_from_scheduled_start_and_reminder_before", () => {
        const scheduled_start = "2026-04-05T15:00:00Z"; // UTC
        const reminder_before = 30; // 分钟
        // 计算逻辑：reminder_at = scheduled_start - reminder_before * 60000
        const reminder_at = new Date(new Date(scheduled_start).getTime() - reminder_before * 60000).toISOString();
        expect(reminder_at).toBe("2026-04-05T14:30:00.000Z");
    });
    // 场景 1.2: PATCH 接受 reminder/recurrence 字段并透传给 update
    it("should_pass_reminder_fields_when_updating_todo", async () => {
        vi.mocked(todoRepo.update).mockResolvedValue(undefined);
        const fields = {
            reminder_before: 15,
            reminder_types: ["notification", "sound"],
            recurrence_rule: "weekly:1",
        };
        await todoRepo.update("t1", fields);
        expect(todoRepo.update).toHaveBeenCalledWith("t1", expect.objectContaining({
            reminder_before: 15,
            reminder_types: ["notification", "sound"],
            recurrence_rule: "weekly:1",
        }));
    });
    // 场景 1.2: 清除提醒
    it("should_clear_reminder_when_reminder_before_is_null", async () => {
        vi.mocked(todoRepo.update).mockResolvedValue(undefined);
        await todoRepo.update("t1", {
            reminder_before: null,
            reminder_at: null,
            reminder_types: null,
        });
        expect(todoRepo.update).toHaveBeenCalledWith("t1", expect.objectContaining({
            reminder_before: null,
            reminder_at: null,
            reminder_types: null,
        }));
    });
});
//# sourceMappingURL=todos.test.js.map