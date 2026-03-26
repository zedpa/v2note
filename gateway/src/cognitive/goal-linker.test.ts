/**
 * goal-lifecycle spec 测试（后端部分）
 * 覆盖场景 6-16: 自动关联、健康度、行动事件、涌现目标、状态流转
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { Goal } from "../db/repositories/goal.js";

// ── Mock helpers ──────────────────────────────────────────────────────

function makeStrike(overrides: Partial<StrikeEntry> = {}): StrikeEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    user_id: "user-1",
    nucleus: "test",
    polarity: "perceive",
    field: {},
    source_id: null,
    source_span: null,
    source_type: "think",
    confidence: 0.8,
    salience: 1.0,
    status: "active",
    superseded_by: null,
    is_cluster: false,
    level: 1,
    origin: null,
    created_at: new Date().toISOString(),
    digested_at: null,
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    device_id: "dev-1",
    title: "评估供应商",
    parent_id: null,
    status: "active",
    source: "speech",
    cluster_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────

const mockGoalCreate = vi.fn();
const mockGoalUpdate = vi.fn();
const mockGoalFindById = vi.fn();
const mockGoalFindActiveByUser = vi.fn().mockResolvedValue([]);
const mockGoalFindWithTodos = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/goal.js", () => ({
  create: (...args: any[]) => mockGoalCreate(...args),
  update: (...args: any[]) => mockGoalUpdate(...args),
  findById: (...args: any[]) => mockGoalFindById(...args),
  findActiveByUser: (...args: any[]) => mockGoalFindActiveByUser(...args),
  findWithTodos: (...args: any[]) => mockGoalFindWithTodos(...args),
  findByUser: vi.fn().mockResolvedValue([]),
}));

const mockStrikeFindByUser = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/strike.js", () => ({
  findByUser: (...args: any[]) => mockStrikeFindByUser(...args),
  findById: vi.fn().mockResolvedValue(null),
  update: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock("../db/repositories/todo.js", () => ({
  findPendingByUser: vi.fn().mockResolvedValue([]),
  findByUser: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
}));

const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
const mockExecute = vi.fn().mockResolvedValue(undefined);

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  execute: (...args: any[]) => mockExecute(...args),
}));

// ── Import after mocks ────────────────────────────────────────────────

const {
  computeGoalHealth,
  checkIntendEmergence,
  updateGoalStatus,
  createActionEvent,
  getGoalTimeline,
} = await import("./goal-linker.js");

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  // 恢复默认实现
  mockQuery.mockResolvedValue([]);
  mockQueryOne.mockResolvedValue(null);
  mockExecute.mockResolvedValue(undefined);
  mockGoalFindActiveByUser.mockResolvedValue([]);
  mockGoalFindWithTodos.mockResolvedValue([]);
  mockStrikeFindByUser.mockResolvedValue([]);
});

describe("场景 8: 健康度四要素自动计算", () => {
  it("should_compute_direction_from_intend_ratio", async () => {
    const goalId = "goal-1";
    const clusterId = "cluster-1";

    mockGoalFindById.mockResolvedValue(makeGoal({ id: goalId, cluster_id: clusterId }));
    // cluster 有 20 个成员，其中 7 个 intend
    mockQuery.mockResolvedValueOnce([
      { polarity: "perceive", count: "8" },
      { polarity: "judge", count: "3" },
      { polarity: "intend", count: "7" },
      { polarity: "feel", count: "2" },
    ]);
    // todo 完成率
    mockGoalFindWithTodos.mockResolvedValue([
      { id: "t1", done: true },
      { id: "t2", done: false },
      { id: "t3", done: true },
    ]);

    const health = await computeGoalHealth(goalId);

    expect(health).toBeDefined();
    // direction = intend 占比 * 100 = 7/20 * 100 = 35
    expect(health!.direction).toBe(35);
    // path = 完成比例 * 100 = 2/3 * 100 ≈ 67
    expect(health!.path).toBe(67);
    // resource = perceive count
    expect(health!.resource).toBe(8);
    // drive = feel+judge > 0 → 有驱动力
    expect(health!.drive).toBeGreaterThan(0);
  });

  it("should_return_null_when_goal_has_no_cluster", async () => {
    mockGoalFindById.mockResolvedValue(makeGoal({ id: "g2", cluster_id: null }));

    const health = await computeGoalHealth("g2");

    expect(health).toBeNull();
  });
});

describe("场景 13: intend 密度超标触发目标涌现", () => {
  it("should_suggest_goal_when_intend_density_exceeds_threshold", async () => {
    // cluster 有 20 个 think Strike，7 个 intend (35%)
    const cluster = makeStrike({
      id: "cluster-1",
      is_cluster: true,
      level: 1,
      nucleus: "供应链管理",
    });

    // 无已关联 active goal
    mockGoalFindActiveByUser.mockResolvedValue([]);

    // cluster 成员统计
    mockQuery
      .mockResolvedValueOnce([{ total: "20", intend_count: "7" }]) // cluster stats
      .mockResolvedValueOnce([]); // 无已关联 goal

    mockGoalCreate.mockResolvedValue(
      makeGoal({ id: "g-new", title: "供应链管理", status: "active" }),
    );

    const result = await checkIntendEmergence(cluster, "user-1");

    expect(result).not.toBeNull();
    expect(mockGoalCreate).toHaveBeenCalledTimes(1);
    const createArg = mockGoalCreate.mock.calls[0][0];
    expect(createArg.title).toBe("供应链管理");
  });

  it("should_not_create_goal_when_density_below_threshold", async () => {
    const cluster = makeStrike({
      id: "cluster-2",
      is_cluster: true,
      nucleus: "杂项",
    });

    mockGoalFindActiveByUser.mockResolvedValue([]);
    mockQuery
      .mockResolvedValueOnce([{ total: "20", intend_count: "4" }]) // 20% < 30%
      .mockResolvedValueOnce([]);

    const result = await checkIntendEmergence(cluster, "user-1");

    expect(result).toBeNull();
    expect(mockGoalCreate).not.toHaveBeenCalled();
  });
});

describe("场景 14: 手动目标不重复涌现", () => {
  it("should_skip_emergence_when_cluster_already_has_active_goal", async () => {
    const cluster = makeStrike({
      id: "cluster-3",
      is_cluster: true,
      nucleus: "评估供应商",
    });

    mockQuery
      .mockResolvedValueOnce([{ total: "20", intend_count: "8" }]) // 40% > 30%
      .mockResolvedValueOnce([{ id: "existing-goal" }]); // 已有 goal

    const result = await checkIntendEmergence(cluster, "user-1");

    expect(result).toBeNull();
    expect(mockGoalCreate).not.toHaveBeenCalled();
  });
});

describe("场景 9-10: 行动事件持久化", () => {
  it("should_create_skip_event", async () => {
    mockExecute.mockResolvedValue(undefined);

    await createActionEvent({
      todo_id: "t1",
      type: "skip",
      reason: "resistance",
    });

    // insert action_event + update skip_count = 2 次
    expect(mockExecute).toHaveBeenCalledTimes(2);
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).toContain("action_event");
    const sql2 = mockExecute.mock.calls[1][0] as string;
    expect(sql2).toContain("skip_count");
  });

  it("should_create_complete_event", async () => {
    mockExecute.mockResolvedValue(undefined);

    await createActionEvent({
      todo_id: "t2",
      type: "complete",
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe("场景 15: 目标状态流转", () => {
  it("should_transition_active_to_progressing_when_todo_completed", async () => {
    const goalId = "goal-1";
    mockGoalFindById.mockResolvedValue(
      makeGoal({ id: goalId, status: "active" }),
    );
    mockGoalFindWithTodos.mockResolvedValue([
      { id: "t1", done: true },
      { id: "t2", done: false },
    ]);

    await updateGoalStatus(goalId, "todo_completed");

    expect(mockGoalUpdate).toHaveBeenCalledWith(goalId, {
      status: "progressing",
    });
  });

  it("should_transition_progressing_to_blocked_when_skip_threshold", async () => {
    const goalId = "goal-2";
    mockGoalFindById.mockResolvedValue(
      makeGoal({ id: goalId, status: "progressing" as any }),
    );
    // 有 todo 被跳过 3+ 次
    mockQuery.mockResolvedValueOnce([{ skip_count: "3" }]);

    await updateGoalStatus(goalId, "todo_skipped_3");

    expect(mockGoalUpdate).toHaveBeenCalledWith(goalId, {
      status: "blocked",
    });
  });

  it("should_not_transition_when_already_archived", async () => {
    const goalId = "goal-3";
    mockGoalFindById.mockResolvedValue(
      makeGoal({ id: goalId, status: "abandoned" as any }),
    );

    await updateGoalStatus(goalId, "todo_completed");

    expect(mockGoalUpdate).not.toHaveBeenCalled();
  });
});

describe("场景 16: 目标时间线", () => {
  it("should_return_related_records_via_cluster", async () => {
    const goalId = "goal-timeline-1";
    mockGoalFindById.mockResolvedValueOnce(
      makeGoal({ id: goalId, cluster_id: "cluster-1" }),
    );
    // 通过 cluster 成员追溯日记
    mockQuery.mockResolvedValueOnce([
      { id: "r1", source_id: "rec-1", nucleus: "讨论供应商价格", polarity: "perceive", created_at: "2026-03-20" },
      { id: "r2", source_id: "rec-2", nucleus: "决定换供应商", polarity: "intend", created_at: "2026-03-22" },
    ]);

    const timeline = await getGoalTimeline(goalId);

    expect(timeline).toHaveLength(2);
    expect(timeline[0].created_at).toBe("2026-03-20");
  });

  it("should_return_empty_when_no_cluster", async () => {
    mockGoalFindById.mockResolvedValue(
      makeGoal({ id: "g2", cluster_id: null }),
    );

    const timeline = await getGoalTimeline("g2");

    expect(timeline).toHaveLength(0);
  });
});
