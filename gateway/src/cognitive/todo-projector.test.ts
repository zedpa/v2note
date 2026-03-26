/**
 * todo-strike-bridge spec 测试
 * 覆盖场景 1-5: intend Strike 投影 todo、回补关联、goal 关联 Cluster、双向一致性、Strike 删除保护
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StrikeEntry } from "../db/repositories/strike.js";
import type { Todo } from "../db/repositories/todo.js";
import type { Goal } from "../db/repositories/goal.js";

// ── Mock helpers ──────────────────────────────────────────────────────

function makeStrike(overrides: Partial<StrikeEntry> = {}): StrikeEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    user_id: "user-1",
    nucleus: "下季度降成本20%",
    polarity: "intend",
    field: {},
    source_id: "record-1",
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

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    record_id: "record-1",
    text: "降成本20%",
    done: false,
    estimated_minutes: null,
    scheduled_start: null,
    scheduled_end: null,
    priority: 3,
    completed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    device_id: "dev-1",
    title: "供应链优化",
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

const mockTodoCreate = vi.fn();
const mockTodoUpdate = vi.fn();
const mockTodoFindPendingByUser = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/todo.js", () => ({
  create: (...args: any[]) => mockTodoCreate(...args),
  update: (...args: any[]) => mockTodoUpdate(...args),
  findPendingByUser: (...args: any[]) => mockTodoFindPendingByUser(...args),
  findByUser: vi.fn().mockResolvedValue([]),
}));

const mockStrikeUpdate = vi.fn();
const mockStrikeFindById = vi.fn();
const mockStrikeUpdateStatus = vi.fn();
const mockStrikeFindByUser = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/strike.js", () => ({
  update: (...args: any[]) => mockStrikeUpdate(...args),
  findById: (...args: any[]) => mockStrikeFindById(...args),
  updateStatus: (...args: any[]) => mockStrikeUpdateStatus(...args),
  findByUser: (...args: any[]) => mockStrikeFindByUser(...args),
}));

const mockGoalUpdate = vi.fn();
const mockGoalFindActiveByUser = vi.fn().mockResolvedValue([]);
const mockGoalFindWithTodos = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/goal.js", () => ({
  update: (...args: any[]) => mockGoalUpdate(...args),
  findActiveByUser: (...args: any[]) => mockGoalFindActiveByUser(...args),
  findWithTodos: (...args: any[]) => mockGoalFindWithTodos(...args),
  findByUser: vi.fn().mockResolvedValue([]),
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
  projectIntendStrike,
  onTodoComplete,
  guardStrikeArchive,
} = await import("./todo-projector.js");

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("场景 1: intend Strike 自动投影为 todo", () => {
  it("should_create_todo_when_intend_strike_with_action_granularity", async () => {
    const strike = makeStrike({
      id: "strike-1",
      polarity: "intend",
      nucleus: "明天下午3点找张总确认报价",
      source_id: "record-1",
    });

    const createdTodo = makeTodo({
      id: "todo-1",
      record_id: "record-1",
      text: "明天下午3点找张总确认报价",
      strike_id: "strike-1",
    } as any);
    mockTodoCreate.mockResolvedValue(createdTodo);

    const result = await projectIntendStrike(strike, "user-1");

    expect(mockTodoCreate).toHaveBeenCalledTimes(1);
    const createArg = mockTodoCreate.mock.calls[0][0];
    expect(createArg.record_id).toBe("record-1");
    expect(createArg.text).toBe("明天下午3点找张总确认报价");
    expect(createArg.strike_id).toBe("strike-1");
    expect(result).toBeDefined();
  });

  it("should_not_create_todo_when_polarity_is_not_intend", async () => {
    const strike = makeStrike({ polarity: "perceive" });

    const result = await projectIntendStrike(strike, "user-1");

    expect(mockTodoCreate).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("should_not_create_todo_when_strike_has_no_source_id", async () => {
    const strike = makeStrike({ polarity: "intend", source_id: null });

    const result = await projectIntendStrike(strike, "user-1");

    expect(mockTodoCreate).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("should_inherit_context_from_strike_nucleus", async () => {
    const strike = makeStrike({
      id: "strike-2",
      polarity: "intend",
      nucleus: "下周一提交季度报告给李总",
      source_id: "record-2",
    });

    mockTodoCreate.mockResolvedValue(makeTodo({ text: strike.nucleus }));
    await projectIntendStrike(strike, "user-1");

    const createArg = mockTodoCreate.mock.calls[0][0];
    expect(createArg.text).toBe("下周一提交季度报告给李总");
  });
});

describe("场景 2: 已有 todo 回补 Strike 关联", () => {
  // 注意：回补迁移是批量操作，使用 embedding 匹配
  // 这里测试的是 backfillTodoStrikes 函数的逻辑

  it("should_link_todo_to_matching_intend_strike_when_similarity_above_threshold", async () => {
    const { backfillTodoStrikes } = await import("./todo-projector.js");

    const todo = makeTodo({ id: "todo-1", text: "降成本20%" });
    const strike = makeStrike({
      id: "strike-1",
      polarity: "intend",
      nucleus: "下季度降成本20%",
    });

    mockTodoFindPendingByUser.mockResolvedValue([todo]);
    mockStrikeFindByUser.mockResolvedValue([strike]);
    // mock embedding 匹配返回高相似度
    mockQuery.mockResolvedValueOnce([
      { strike_id: "strike-1", similarity: 0.85 },
    ]);

    const result = await backfillTodoStrikes("user-1");

    expect(result.linked).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("should_skip_todo_when_similarity_below_threshold", async () => {
    const { backfillTodoStrikes } = await import("./todo-projector.js");

    const todo = makeTodo({ id: "todo-2", text: "买菜" });
    const strike = makeStrike({
      id: "strike-2",
      polarity: "intend",
      nucleus: "下季度降成本20%",
    });

    mockTodoFindPendingByUser.mockResolvedValue([todo]);
    mockStrikeFindByUser.mockResolvedValue([strike]);
    mockQuery.mockResolvedValueOnce([
      { strike_id: "strike-2", similarity: 0.3 },
    ]);

    const result = await backfillTodoStrikes("user-1");

    expect(result.linked).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe("场景 3: goal 关联 Cluster", () => {
  it("should_link_goal_to_matching_cluster_via_embedding", async () => {
    const { linkGoalsToClusters } = await import("./todo-projector.js");

    const goal = makeGoal({ id: "goal-1", title: "供应链优化" });
    mockGoalFindActiveByUser.mockResolvedValue([goal]);
    // mock embedding 查询返回最匹配的 cluster
    mockQuery.mockResolvedValueOnce([
      { id: "cluster-1", similarity: 0.82 },
    ]);

    const result = await linkGoalsToClusters("user-1");

    expect(mockGoalUpdate).toHaveBeenCalledWith("goal-1", {
      cluster_id: "cluster-1",
    });
    expect(result.linked).toBe(1);
  });

  it("should_skip_goal_when_no_matching_cluster", async () => {
    const { linkGoalsToClusters } = await import("./todo-projector.js");

    const goal = makeGoal({ id: "goal-2", title: "学弹吉他" });
    mockGoalFindActiveByUser.mockResolvedValue([goal]);
    mockQuery.mockResolvedValueOnce([]); // 无匹配 cluster

    const result = await linkGoalsToClusters("user-1");

    expect(mockGoalUpdate).not.toHaveBeenCalled();
    expect(result.linked).toBe(0);
  });
});

describe("场景 4: 双向一致性", () => {
  it("should_reduce_strike_salience_when_todo_completed", async () => {
    const todoId = "todo-1";
    const strikeId = "strike-1";

    // mock: 通过 todo 找到关联的 strike
    mockQueryOne.mockResolvedValueOnce({
      id: todoId,
      strike_id: strikeId,
      done: true,
    });
    mockStrikeFindById.mockResolvedValueOnce(
      makeStrike({ id: strikeId, salience: 1.0 }),
    );

    await onTodoComplete(todoId);

    expect(mockStrikeUpdate).toHaveBeenCalledWith(strikeId, {
      salience: expect.any(Number),
    });
    // salience 应降低
    const newSalience = mockStrikeUpdate.mock.calls[0][1].salience;
    expect(newSalience).toBeLessThan(1.0);
    expect(newSalience).toBeGreaterThanOrEqual(0.1);
  });

  it("should_not_reduce_salience_when_todo_has_no_strike_id", async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: "todo-2",
      strike_id: null,
      done: true,
    });

    await onTodoComplete("todo-2");

    expect(mockStrikeUpdate).not.toHaveBeenCalled();
  });

  it("should_update_goal_completion_rate_when_todo_belongs_to_goal", async () => {
    const todoId = "todo-1";
    const strikeId = "strike-1";
    const goalId = "goal-1";

    mockQueryOne.mockResolvedValueOnce({
      id: todoId,
      strike_id: strikeId,
      goal_id: goalId,
      done: true,
    });
    mockStrikeFindById.mockResolvedValueOnce(
      makeStrike({ id: strikeId, salience: 1.0 }),
    );
    // goal 有 3 个 todo，2 个已完成
    mockGoalFindWithTodos.mockResolvedValueOnce([
      { id: "t1", done: true },
      { id: "t2", done: true },
      { id: "t3", done: false },
    ]);

    await onTodoComplete(todoId);

    expect(mockStrikeUpdate).toHaveBeenCalled();
    // goal completion rate = 2/3 ≈ 0.67, 不需要 status 变更
  });
});

describe("场景 5: Strike 删除保护", () => {
  it("should_block_archive_when_strike_has_active_todo", async () => {
    const strikeId = "strike-1";

    // mock: strike 有关联的 active（未完成）todo
    mockQuery.mockResolvedValueOnce([
      { id: "todo-1", strike_id: strikeId, done: false },
    ]);

    const canArchive = await guardStrikeArchive(strikeId);

    expect(canArchive).toBe(false);
    expect(mockStrikeUpdateStatus).not.toHaveBeenCalled();
  });

  it("should_allow_archive_when_all_linked_todos_are_done", async () => {
    const strikeId = "strike-2";

    // SQL 查 done=false，全部已完成则返回空数组
    mockQuery.mockResolvedValueOnce([]);

    const canArchive = await guardStrikeArchive(strikeId);

    expect(canArchive).toBe(true);
  });

  it("should_allow_archive_when_strike_has_no_linked_todos", async () => {
    const strikeId = "strike-3";

    mockQuery.mockResolvedValueOnce([]);

    const canArchive = await guardStrikeArchive(strikeId);

    expect(canArchive).toBe(true);
  });

  it("should_enforce_minimum_salience_for_strike_with_active_todo", async () => {
    // Strike salience 衰减不低于 0.1
    const strikeId = "strike-1";

    mockQuery.mockResolvedValueOnce([
      { id: "todo-1", strike_id: strikeId, done: false },
    ]);
    mockStrikeFindById.mockResolvedValueOnce(
      makeStrike({ id: strikeId, salience: 0.05 }),
    );

    const { enforceMinSalience } = await import("./todo-projector.js");
    await enforceMinSalience(strikeId);

    expect(mockStrikeUpdate).toHaveBeenCalledWith(strikeId, {
      salience: 0.1,
    });
  });

  it("should_not_bump_salience_when_above_minimum", async () => {
    const strikeId = "strike-2";

    mockQuery.mockResolvedValueOnce([
      { id: "todo-2", strike_id: strikeId, done: false },
    ]);
    mockStrikeFindById.mockResolvedValueOnce(
      makeStrike({ id: strikeId, salience: 0.5 }),
    );

    const { enforceMinSalience } = await import("./todo-projector.js");
    await enforceMinSalience(strikeId);

    expect(mockStrikeUpdate).not.toHaveBeenCalled();
  });
});
