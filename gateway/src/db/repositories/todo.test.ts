/**
 * regression: fix-todo-project-vanish
 *
 * 回归测试：findByUser / findByDevice 应返回挂在项目下的待办，
 * 同时排除子任务（parent 为普通任务的待办）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 数据库和 embedding ──
const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockExecute = vi.fn();
vi.mock("../pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  execute: (...args: any[]) => mockExecute(...args),
}));

const mockGetEmbedding = vi.fn();
const mockCosineSimilarity = vi.fn();
vi.mock("../../memory/embeddings.js", () => ({
  getEmbedding: (...args: any[]) => mockGetEmbedding(...args),
  cosineSimilarity: (...args: any[]) => mockCosineSimilarity(...args),
}));

import { findByUser, findByDevice } from "./todo.js";

describe("regression: fix-todo-project-vanish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── findByUser ──

  it("should_return_todos_with_project_parent_when_findByUser", async () => {
    // 模拟返回一个挂在项目下的待办（parent_id 不为 null，但 parent 是 level>=1 的项目）
    const projectChildTodo = {
      id: "todo-1",
      parent_id: "project-1",
      text: "项目下的任务",
      level: 0,
      goal_title: "我的项目",
    };
    mockQuery.mockResolvedValueOnce([projectChildTodo]);

    const result = await findByUser("user-1");

    // 验证 SQL 不再是 `AND t.parent_id IS NULL`
    // 而是 `AND (t.parent_id IS NULL OR p.id IS NOT NULL)`
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).not.toContain("AND t.parent_id IS NULL");
    expect(sql).toContain("t.parent_id IS NULL OR p.id IS NOT NULL");
    expect(result).toEqual([projectChildTodo]);
  });

  it("should_exclude_subtasks_when_findByUser", async () => {
    // SQL 条件确保：当 parent 是普通任务（level=0）时，p.id IS NULL（因为 JOIN 条件 p.level>=1 不满足），
    // 且 t.parent_id IS NOT NULL → 两个 OR 分支都为 false → 被排除
    mockQuery.mockResolvedValueOnce([]);

    await findByUser("user-1");

    const sql = mockQuery.mock.calls[0][0] as string;
    // LEFT JOIN 条件中有 p.level >= 1，确保只有项目/目标的 parent 会被 join 上
    expect(sql).toContain("p.level >= 1");
    // OR 条件确保子任务（parent 是普通任务）不会通过
    expect(sql).toContain("t.parent_id IS NULL OR p.id IS NOT NULL");
  });

  // ── findByDevice ──

  it("should_return_todos_with_project_parent_when_findByDevice", async () => {
    const projectChildTodo = {
      id: "todo-2",
      parent_id: "project-2",
      text: "设备下项目任务",
      level: 0,
      goal_title: "设备项目",
    };
    mockQuery.mockResolvedValueOnce([projectChildTodo]);

    const result = await findByDevice("device-1");

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).not.toContain("AND t.parent_id IS NULL");
    expect(sql).toContain("t.parent_id IS NULL OR p.id IS NOT NULL");
    expect(result).toEqual([projectChildTodo]);
  });

  it("should_return_independent_todos_when_findByUser", async () => {
    // 无 parent_id 的独立任务应正常返回（t.parent_id IS NULL 分支）
    const independentTodo = {
      id: "todo-3",
      parent_id: null,
      text: "独立任务",
      level: 0,
      goal_title: null,
    };
    mockQuery.mockResolvedValueOnce([independentTodo]);

    const result = await findByUser("user-1");

    expect(result).toEqual([independentTodo]);
    // SQL 仍包含 parent_id IS NULL 作为 OR 的一个分支
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("t.parent_id IS NULL");
  });
});
