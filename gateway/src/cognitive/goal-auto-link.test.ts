/**
 * goal-auto-link spec 测试
 * 场景 1: 全量关联 | 场景 2: 孤立目标自动关联集群 | 场景 4: 项目进度汇总
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Goal } from "../db/repositories/goal.js";

// ── Mock helpers ──────────────────────────────────────────────────────

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    device_id: "dev-1",
    title: "评估供应商",
    parent_id: null,
    status: "active",
    source: "explicit",
    cluster_id: null,
    wiki_page_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────

const mockGoalFindById = vi.fn();
const mockGoalFindActiveByUser = vi.fn().mockResolvedValue([]);
const mockGoalUpdate = vi.fn();
const mockGoalFindWithTodos = vi.fn().mockResolvedValue([]);
const mockGoalFindByUser = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/goal.js", () => ({
  findById: (...args: any[]) => mockGoalFindById(...args),
  findActiveByUser: (...args: any[]) => mockGoalFindActiveByUser(...args),
  update: (...args: any[]) => mockGoalUpdate(...args),
  findWithTodos: (...args: any[]) => mockGoalFindWithTodos(...args),
  findByUser: (...args: any[]) => mockGoalFindByUser(...args),
  create: vi.fn(),
}));

const mockTodoUpdate = vi.fn();

vi.mock("../db/repositories/todo.js", () => ({
  update: (...args: any[]) => mockTodoUpdate(...args),
  findPendingByUser: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  findByUser: vi.fn().mockResolvedValue([]),
}));

const mockQuery = vi.fn().mockResolvedValue([]);

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: vi.fn().mockResolvedValue(null),
  execute: vi.fn(),
}));

vi.mock("../db/repositories/strike.js", () => ({
  findById: vi.fn(),
  findByUser: vi.fn().mockResolvedValue([]),
  update: vi.fn(),
  create: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────

const { goalAutoLink, linkNewStrikesToGoals, getProjectProgress } = await import("./goal-auto-link.js");

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGoalFindActiveByUser.mockResolvedValue([]);
  mockGoalFindByUser.mockResolvedValue([]);
  mockGoalFindWithTodos.mockResolvedValue([]);
  mockQuery.mockResolvedValue([]);
});

describe("场景 1: 目标创建后全量关联", () => {
  it("should_link_to_matching_cluster", async () => {
    const goal = makeGoal({ id: "goal-1", cluster_id: null });
    mockGoalFindById.mockResolvedValue(goal);

    // 1. cluster embedding 匹配
    mockQuery.mockResolvedValueOnce([{ id: "cluster-1", similarity: 0.8 }]);
    // 2. 相关记录统计
    mockQuery.mockResolvedValueOnce([{ id: "rec-1" }, { id: "rec-2" }]);
    // 3. pending todo 匹配
    mockQuery.mockResolvedValueOnce([{ id: "todo-1", text: "联系供应商", similarity: 0.7 }]);

    const result = await goalAutoLink("goal-1", "user-1");

    expect(result.clusterLinked).toBe(true);
    expect(mockGoalUpdate).toHaveBeenCalledWith("goal-1", { cluster_id: "cluster-1" });
    expect(result.recordsFound).toBe(2);
    expect(result.todosLinked).toBe(1);
  });

  it("should_not_link_cluster_if_similarity_below_threshold", async () => {
    const goal = makeGoal({ id: "goal-1" });
    mockGoalFindById.mockResolvedValue(goal);

    // cluster 匹配度低
    mockQuery.mockResolvedValueOnce([{ id: "cluster-1", similarity: 0.5 }]);
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);

    const result = await goalAutoLink("goal-1", "user-1");

    expect(result.clusterLinked).toBe(false);
    expect(mockGoalUpdate).not.toHaveBeenCalled();
  });

  it("should_skip_if_goal_already_has_cluster", async () => {
    const goal = makeGoal({ id: "goal-1", cluster_id: "existing-cluster" });
    mockGoalFindById.mockResolvedValue(goal);

    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);

    const result = await goalAutoLink("goal-1", "user-1");

    expect(result.clusterLinked).toBe(true);
    expect(mockGoalUpdate).not.toHaveBeenCalled();
  });

  it("should_handle_missing_goal_gracefully", async () => {
    mockGoalFindById.mockResolvedValue(null);

    const result = await goalAutoLink("nonexistent", "user-1");

    expect(result.clusterLinked).toBe(false);
    expect(result.recordsFound).toBe(0);
  });
});

describe("场景 2: digest 后孤立目标自动关联集群", () => {
  it("should_link_orphan_goal_to_matching_cluster", async () => {
    // 孤立目标（无 cluster_id）
    const activeGoals = [
      makeGoal({ id: "goal-1", title: "评估供应商", cluster_id: null }),
    ];
    mockGoalFindActiveByUser.mockResolvedValue(activeGoals);

    // query: goal embedding vs cluster embedding 匹配
    mockQuery.mockResolvedValueOnce([
      { cluster_id: "cluster-1", similarity: 0.72 },
    ]);

    const result = await linkNewStrikesToGoals(
      [{ id: "strike-new", source_id: "record-1" }],
      "user-1",
    );

    expect(result.linked).toBe(1);
    expect(mockGoalUpdate).toHaveBeenCalledWith("goal-1", { cluster_id: "cluster-1" });
  });

  it("should_not_link_when_similarity_below_threshold", async () => {
    const activeGoals = [
      makeGoal({ id: "goal-1", title: "评估供应商", cluster_id: null }),
    ];
    mockGoalFindActiveByUser.mockResolvedValue(activeGoals);

    // 匹配度低于 0.6
    mockQuery.mockResolvedValueOnce([
      { cluster_id: "cluster-1", similarity: 0.4 },
    ]);

    const result = await linkNewStrikesToGoals(
      [{ id: "strike-unrelated", source_id: "record-2" }],
      "user-1",
    );

    expect(result.linked).toBe(0);
    expect(mockGoalUpdate).not.toHaveBeenCalled();
  });

  it("should_skip_when_all_goals_already_have_cluster", async () => {
    const activeGoals = [
      makeGoal({ id: "goal-1", cluster_id: "cluster-1" }),
    ];
    mockGoalFindActiveByUser.mockResolvedValue(activeGoals);

    const result = await linkNewStrikesToGoals(
      [{ id: "strike-new", source_id: "record-1" }],
      "user-1",
    );

    expect(result.linked).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should_return_zero_for_empty_strikes", async () => {
    const result = await linkNewStrikesToGoals([], "user-1");
    expect(result.linked).toBe(0);
  });
});

describe("场景 4: 项目进度汇总", () => {
  it("should_aggregate_child_goal_progress", async () => {
    const childGoals = [
      makeGoal({ id: "child-1", title: "子目标1", parent_id: "project-1" }),
      makeGoal({ id: "child-2", title: "子目标2", parent_id: "project-1" }),
    ];
    mockGoalFindByUser.mockResolvedValue(childGoals);

    // child-1 的 todos
    mockGoalFindWithTodos
      .mockResolvedValueOnce([
        { id: "t1", done: true },
        { id: "t2", done: false },
      ])
      // child-2 的 todos
      .mockResolvedValueOnce([
        { id: "t3", done: true },
        { id: "t4", done: true },
        { id: "t5", done: false },
      ]);

    const progress = await getProjectProgress("project-1", "user-1");

    expect(progress.children).toHaveLength(2);
    expect(progress.totalTodos).toBe(5);
    expect(progress.completedTodos).toBe(3);
    expect(progress.overallPercent).toBe(60);
    expect(progress.children[0].completionPercent).toBe(50);
    expect(progress.children[1].completionPercent).toBe(67);
  });

  it("should_handle_no_children", async () => {
    mockGoalFindByUser.mockResolvedValue([]);

    const progress = await getProjectProgress("project-1", "user-1");

    expect(progress.children).toHaveLength(0);
    expect(progress.overallPercent).toBe(0);
  });
});
