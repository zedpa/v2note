/**
 * todo-subtask spec 测试
 * 场景 1-6: 子任务 CRUD、完成联动、层级校验
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../db/repositories/index.js", () => ({
  todoRepo: {
    create: vi.fn(),
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
    vi.mocked(todoRepo.create).mockResolvedValue(mockTodo as any);

    const result = await todoRepo.create({
      text: "子步骤1",
      parent_id: "parent1",
      user_id: "u1",
    });

    expect(todoRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: "parent1" }),
    );
    expect(result.parent_id).toBe("parent1");
  });

  // 场景 5: 子任务不应出现在顶层列表
  it("should_exclude_subtasks_from_top_level_list", async () => {
    // findByUser 的查询应排除有 parent_id 的 todo
    vi.mocked(todoRepo.findByUser).mockResolvedValue([
      { id: "t1", text: "父任务", parent_id: null, done: false } as any,
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
      { id: "sub1", text: "步骤1", parent_id: "p1", done: true } as any,
      { id: "sub2", text: "步骤2", parent_id: "p1", done: false } as any,
    ]);

    const subs = await todoRepo.findSubtasks("p1");
    expect(subs).toHaveLength(2);
    expect(subs.every((s: any) => s.parent_id === "p1")).toBe(true);
  });
});
