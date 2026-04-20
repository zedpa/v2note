/**
 * goal-linker 测试
 * 覆盖：健康度计算、行动事件、状态流转、时间线
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
    source: "speech",
    wiki_page_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────

const mockGoalCreate = vi.fn();
const mockGoalUpdate = vi.fn();
const mockGoalFindById = vi.fn();
const mockGoalFindWithTodos = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/goal.js", () => ({
  create: (...args: any[]) => mockGoalCreate(...args),
  update: (...args: any[]) => mockGoalUpdate(...args),
  findById: (...args: any[]) => mockGoalFindById(...args),
  findActiveByUser: vi.fn().mockResolvedValue([]),
  findWithTodos: (...args: any[]) => mockGoalFindWithTodos(...args),
  findByUser: vi.fn().mockResolvedValue([]),
}));

const mockQuery = vi.fn().mockResolvedValue([]);
const mockExecute = vi.fn().mockResolvedValue(undefined);

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: vi.fn().mockResolvedValue(null),
  execute: (...args: any[]) => mockExecute(...args),
}));

// ── Import after mocks ────────────────────────────────────────────────

const {
  computeGoalHealth,
  updateGoalStatus,
  createActionEvent,
  getGoalTimeline,
} = await import("./goal-linker.js");

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockQuery.mockResolvedValue([]);
  mockExecute.mockResolvedValue(undefined);
  mockGoalFindWithTodos.mockResolvedValue([]);
});

describe("健康度计算（简化版）", () => {
  it("should_compute_path_from_todo_completion_rate", async () => {
    mockGoalFindById.mockResolvedValue(makeGoal({ id: "g1" }));
    mockGoalFindWithTodos.mockResolvedValue([
      { id: "t1", done: true },
      { id: "t2", done: false },
      { id: "t3", done: true },
    ]);

    const health = await computeGoalHealth("g1");

    expect(health).toBeDefined();
    expect(health!.path).toBe(67); // 2/3 * 100
    expect(health!.direction).toBe(0);
    expect(health!.resource).toBe(0);
    expect(health!.drive).toBe(0);
  });

  it("should_return_null_when_goal_not_found", async () => {
    mockGoalFindById.mockResolvedValue(null);

    const health = await computeGoalHealth("nonexistent");

    expect(health).toBeNull();
  });
});

describe("行动事件", () => {
  it("should_create_skip_event_and_increment_skip_count", async () => {
    mockQuery.mockResolvedValueOnce([{ skip_count: "1", goal_id: null }]);

    await createActionEvent({ todo_id: "t1", type: "skip", reason: "resistance" });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).toContain("action_event");
  });

  it("should_create_complete_event", async () => {
    mockQuery.mockResolvedValueOnce([{ goal_id: null }]);

    await createActionEvent({ todo_id: "t2", type: "complete" });

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe("状态流转", () => {
  it("should_transition_active_to_progressing_on_todo_completed", async () => {
    mockGoalFindById.mockResolvedValue(makeGoal({ id: "g1", status: "active" }));

    await updateGoalStatus("g1", "todo_completed");

    expect(mockGoalUpdate).toHaveBeenCalledWith("g1", { status: "progressing" });
  });

  it("should_transition_progressing_to_blocked_on_skip_threshold", async () => {
    mockGoalFindById.mockResolvedValue(makeGoal({ id: "g2", status: "progressing" as any }));
    mockQuery.mockResolvedValueOnce([{ skip_count: "3" }]);

    await updateGoalStatus("g2", "todo_skipped_3");

    expect(mockGoalUpdate).toHaveBeenCalledWith("g2", { status: "blocked" });
  });

  it("should_not_transition_when_terminal_status", async () => {
    mockGoalFindById.mockResolvedValue(makeGoal({ id: "g3", status: "abandoned" as any }));

    await updateGoalStatus("g3", "todo_completed");

    expect(mockGoalUpdate).not.toHaveBeenCalled();
  });
});

describe("时间线（简化版）", () => {
  it("should_return_empty_array", async () => {
    const timeline = await getGoalTimeline("any-goal");
    expect(timeline).toHaveLength(0);
  });
});
