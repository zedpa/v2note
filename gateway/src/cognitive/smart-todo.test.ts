/**
 * smart-todo spec 测试
 * 覆盖场景 1,5,6,7: 自然语言创建待办、粒度判断、时间/优先级提取、重复检测
 * 场景 2,3,4 依赖 Agent 工具层，在 agent-tool-layer 测试中覆盖
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
const mockGoalFindActiveByUser = vi.fn().mockResolvedValue([]);

vi.mock("../db/repositories/goal.js", () => ({
  create: (...args: any[]) => mockGoalCreate(...args),
  update: (...args: any[]) => mockGoalUpdate(...args),
  findActiveByUser: (...args: any[]) => mockGoalFindActiveByUser(...args),
  findWithTodos: vi.fn().mockResolvedValue([]),
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
  checkDuplicate,
  parseIntendField,
} = await import("./todo-projector.js");

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("场景 1: 自然语言创建待办 — intend 结构化投影", () => {
  it("should_extract_scheduled_start_from_intend_field", async () => {
    const input = makeIntend({
      nucleus: "明天下午3点找张总确认报价",
      field: {
        scheduled_start: "2026-03-26T15:00:00",
        person: "张总",
        priority: "high",
      },
    });

    const createdTodo: Todo = {
      id: "todo-1",
      record_id: "record-1",
      text: input.nucleus,
      done: false,
      estimated_minutes: null,
      scheduled_start: "2026-03-26T15:00:00",
      scheduled_end: null,
      priority: 5,
      completed_at: null,
      created_at: new Date().toISOString(),
      strike_id: null,
    };
    mockTodoCreate.mockResolvedValue(createdTodo);
    mockTodoFindPendingByUser.mockResolvedValue([]); // 无重复

    const result = await projectIntendStrike(input, "user-1");

    expect(mockTodoCreate).toHaveBeenCalledTimes(1);
    const arg = mockTodoCreate.mock.calls[0][0];
    expect(arg.text).toBe("明天下午3点找张总确认报价");
    expect(result).not.toBeNull();
  });

  it("should_set_high_priority_when_field_indicates_urgent", async () => {
    const input = makeIntend({
      nucleus: "找张总确认报价，挺急的",
      field: { priority: "high" },
    });

    mockTodoCreate.mockResolvedValue({ id: "t1" } as any);
    mockTodoFindPendingByUser.mockResolvedValue([]);

    await projectIntendStrike(input, "user-1");

    const parsed = parseIntendField(input.field!);
    expect(parsed.priority).toBe(5);
  });

  it("should_set_low_priority_when_field_indicates_not_urgent", async () => {
    const parsed = parseIntendField({ priority: "low" });
    expect(parsed.priority).toBe(1);
  });

  it("should_set_default_priority_when_no_priority_in_field", async () => {
    const parsed = parseIntendField({});
    expect(parsed.priority).toBe(3);
  });
});

describe("场景 5: 粒度自动判断", () => {
  it("should_create_todo_when_granularity_is_action", async () => {
    const input = makeIntend({
      nucleus: "明天打个电话给张总",
      field: { granularity: "action" },
    });

    mockTodoCreate.mockResolvedValue({ id: "t1" } as any);
    mockTodoFindPendingByUser.mockResolvedValue([]);

    const result = await projectIntendStrike(input, "user-1");

    expect(mockTodoCreate).toHaveBeenCalledTimes(1);
    expect(mockGoalCreate).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });

  it("should_create_action_todo_when_granularity_is_goal_phase14_2", async () => {
    const input = makeIntend({
      nucleus: "今年要把身体搞好",
      field: { granularity: "goal" },
    });

    mockTodoCreate.mockResolvedValue({ id: "t-goal" } as any);
    mockTodoFindPendingByUser.mockResolvedValue([]);

    const result = await projectIntendStrike(input, "user-1");

    expect(mockGoalCreate).not.toHaveBeenCalled();
    expect(mockTodoCreate).toHaveBeenCalledTimes(1);
  });

  it("should_create_action_todo_when_granularity_is_project_phase14_2", async () => {
    const input = makeIntend({
      nucleus: "做一个供应链管理系统",
      field: { granularity: "project" },
    });

    mockTodoCreate.mockResolvedValue({ id: "t-proj" } as any);
    mockTodoFindPendingByUser.mockResolvedValue([]);

    const result = await projectIntendStrike(input, "user-1");

    expect(mockGoalCreate).not.toHaveBeenCalled();
    expect(mockTodoCreate).toHaveBeenCalledTimes(1);
  });

  it("should_default_to_action_when_no_granularity", async () => {
    const input = makeIntend({
      nucleus: "买菜",
      field: {},
    });

    mockTodoCreate.mockResolvedValue({ id: "t2" } as any);
    mockTodoFindPendingByUser.mockResolvedValue([]);

    await projectIntendStrike(input, "user-1");

    expect(mockTodoCreate).toHaveBeenCalledTimes(1);
    expect(mockGoalCreate).not.toHaveBeenCalled();
  });
});

describe("场景 6: 时间/优先级自动提取 — parseIntendField", () => {
  it("should_parse_scheduled_start_from_field", () => {
    const parsed = parseIntendField({
      scheduled_start: "2026-03-25T15:00:00",
    });
    expect(parsed.scheduled_start).toBe("2026-03-25T15:00:00");
  });

  it("should_parse_scheduled_end_as_deadline", () => {
    const parsed = parseIntendField({
      deadline: "2026-03-30",
    });
    expect(parsed.scheduled_end).toBe("2026-03-30");
  });

  it("should_parse_person_into_field", () => {
    const parsed = parseIntendField({
      person: "张总",
    });
    expect(parsed.person).toBe("张总");
  });

  it("should_handle_empty_field_gracefully", () => {
    const parsed = parseIntendField({});
    expect(parsed.priority).toBe(3);
    expect(parsed.scheduled_start).toBeUndefined();
    expect(parsed.scheduled_end).toBeUndefined();
    expect(parsed.person).toBeUndefined();
  });

  it("should_map_priority_string_to_number", () => {
    expect(parseIntendField({ priority: "high" }).priority).toBe(5);
    expect(parseIntendField({ priority: "medium" }).priority).toBe(3);
    expect(parseIntendField({ priority: "low" }).priority).toBe(1);
  });
});

describe("场景 7: 重复待办检测", () => {
  it("should_detect_duplicate_when_similar_todo_exists", async () => {
    mockTodoFindPendingByUser.mockResolvedValue([
      { id: "t-existing", text: "找张总确认报价", done: false },
    ]);

    const result = await checkDuplicate("给张总打电话确认报价", "user-1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("t-existing");
  });

  it("should_not_detect_duplicate_when_no_similar_todo", async () => {
    mockTodoFindPendingByUser.mockResolvedValue([
      { id: "t1", text: "写周报", done: false },
    ]);

    const result = await checkDuplicate("找张总确认报价", "user-1");

    expect(result).toBeNull();
  });

  it("should_not_detect_duplicate_when_no_pending_todos", async () => {
    mockTodoFindPendingByUser.mockResolvedValue([]);

    const result = await checkDuplicate("任何待办", "user-1");

    expect(result).toBeNull();
  });
});
