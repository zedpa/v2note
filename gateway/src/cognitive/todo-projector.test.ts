/**
 * todo-projector 测试
 * 覆盖：intend 投影 todo、onTodoComplete、事件触发
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { daysLater } from "../lib/tz.js";
import type { IntendInput } from "./todo-projector.js";
import type { Todo } from "../db/repositories/todo.js";

// ── Mock helpers ──────────────────────────────────────────────────────

function makeIntend(overrides: Partial<IntendInput> = {}): IntendInput {
  return {
    user_id: "user-1",
    nucleus: "下季度降成本20%",
    polarity: "intend",
    source_id: "record-1",
    field: {},
    ...overrides,
  };
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    record_id: "record-1",
    text: "测试待办",
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

// ── Mocks ─────────────────────────────────────────────────────────────

const mockTodoCreate = vi.fn();
const mockTodoUpdate = vi.fn();
const mockTodoFindPendingByUser = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/todo.js", () => ({
  create: (...args: any[]) => mockTodoCreate(...args),
  dedupCreate: async (...args: any[]) => {
    const todo = await mockTodoCreate(...args);
    return { todo, action: "created" };
  },
  update: (...args: any[]) => mockTodoUpdate(...args),
  findPendingByUser: (...args: any[]) => mockTodoFindPendingByUser(...args),
  findByUser: vi.fn().mockResolvedValue([]),
}));

const mockGoalCreate = vi.fn();
const mockGoalUpdate = vi.fn();
const mockGoalFindWithTodos = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/goal.js", () => ({
  create: (...args: any[]) => mockGoalCreate(...args),
  update: (...args: any[]) => mockGoalUpdate(...args),
  findActiveByUser: vi.fn().mockResolvedValue([]),
  findWithTodos: (...args: any[]) => mockGoalFindWithTodos(...args),
  findByUser: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
}));

const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
const mockExecute = vi.fn().mockResolvedValue(undefined);

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  execute: (...args: any[]) => mockExecute(...args),
}));

const mockEventEmit = vi.fn();
vi.mock("../lib/event-bus.js", () => ({
  eventBus: { emit: (...args: any[]) => mockEventEmit(...args) },
}));

vi.mock("./embed-writer.js", () => ({
  writeTodoEmbedding: vi.fn(),
}));

vi.mock("../db/repositories/record.js", () => ({
  findById: vi.fn().mockResolvedValue({ device_id: "device-1" }),
}));

// ── Import after mocks ────────────────────────────────────────────────

const {
  projectIntendStrike,
  onTodoComplete,
} = await import("./todo-projector.js");

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("场景 1: intend 自动投影为 todo", () => {
  it("should_create_todo_when_intend_with_action_granularity", async () => {
    const input = makeIntend({
      nucleus: "明天下午3点找张总确认报价",
      source_id: "record-1",
    });

    const createdTodo = makeTodo({
      id: "todo-1",
      record_id: "record-1",
      text: "明天下午3点找张总确认报价",
    });
    mockTodoCreate.mockResolvedValue(createdTodo);

    const result = await projectIntendStrike(input, "user-1");

    expect(mockTodoCreate).toHaveBeenCalledTimes(1);
    const createArg = mockTodoCreate.mock.calls[0][0];
    expect(createArg.record_id).toBe("record-1");
    expect(createArg.text).toBe("明天下午3点找张总确认报价");
    expect(result).toBeDefined();
  });

  it("should_not_create_todo_when_polarity_is_not_intend", async () => {
    const input = makeIntend({ polarity: "perceive" });

    const result = await projectIntendStrike(input, "user-1");

    expect(mockTodoCreate).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("should_not_create_todo_when_no_source_id", async () => {
    const input = makeIntend({ polarity: "intend", source_id: null });

    const result = await projectIntendStrike(input, "user-1");

    expect(mockTodoCreate).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("should_extract_scheduled_start_from_intend_field", async () => {
    const tomorrowStr = daysLater(1);

    const input = makeIntend({
      nucleus: "上山打老虎",
      source_id: "record-3",
      field: { scheduled_start: tomorrowStr },
    });

    const createdTodo = makeTodo({ id: "todo-tiger", text: "上山打老虎" });
    mockTodoCreate.mockResolvedValue(createdTodo);
    mockTodoUpdate.mockResolvedValue(undefined);

    await projectIntendStrike(input, "user-1");

    expect(mockTodoCreate).toHaveBeenCalledTimes(1);
    expect(mockTodoUpdate).toHaveBeenCalledWith(
      "todo-tiger",
      expect.objectContaining({ scheduled_start: tomorrowStr }),
    );
  });
});

describe("场景 4: onTodoComplete", () => {
  it("should_noop_when_todo_not_found", async () => {
    mockQueryOne.mockResolvedValueOnce(null);

    await onTodoComplete("nonexistent");

    expect(mockGoalFindWithTodos).not.toHaveBeenCalled();
  });

  it("should_refresh_goal_todos_when_todo_has_goal_id", async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: "todo-1",
      goal_id: "goal-1",
      done: true,
    });

    await onTodoComplete("todo-1");

    expect(mockGoalFindWithTodos).toHaveBeenCalledWith("goal-1");
  });
});

describe("Phase 14.2: goal/project 粒度不再创建 goal", () => {
  it("should_create_action_todo_when_granularity_is_goal", async () => {
    const input = makeIntend({
      nucleus: "我要评估是否换供应商",
      source_id: "record-1",
      field: { granularity: "goal" },
    });

    const createdTodo = makeTodo({ id: "todo-from-goal", text: input.nucleus });
    mockTodoCreate.mockResolvedValue(createdTodo);

    const result = await projectIntendStrike(input, "user-1");

    expect(mockGoalCreate).not.toHaveBeenCalled();
    expect(mockTodoCreate).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });
});

describe("创建后触发 todo.created 事件", () => {
  it("should_emit_todo_created_event", async () => {
    const input = makeIntend({
      nucleus: "明天去超市买水果",
      source_id: "record-1",
      user_id: "user-1",
    });

    const createdTodo = makeTodo({ id: "todo-event-1", text: input.nucleus });
    mockTodoCreate.mockResolvedValue(createdTodo);

    await projectIntendStrike(input, "user-1");

    expect(mockEventEmit).toHaveBeenCalledWith(
      "todo.created",
      expect.objectContaining({
        todoId: "todo-event-1",
        todoText: "明天去超市买水果",
        userId: "user-1",
      }),
    );
  });

  it("should_not_emit_event_when_polarity_is_not_intend", async () => {
    const input = makeIntend({ polarity: "perceive" });

    await projectIntendStrike(input, "user-1");

    expect(mockEventEmit).not.toHaveBeenCalled();
  });
});
