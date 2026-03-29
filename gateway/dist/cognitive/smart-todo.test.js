/**
 * smart-todo spec 测试
 * 覆盖场景 1,5,6,7: 自然语言创建、粒度判断、时间/优先级提取、重复检测
 * 场景 2,3,4 依赖 Agent 工具层，在 agent-tool-layer 测试中覆盖
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mock helpers ──────────────────────────────────────────────────────
function makeStrike(overrides = {}) {
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
// ── Mocks ─────────────────────────────────────────────────────────────
const mockTodoCreate = vi.fn();
const mockTodoUpdate = vi.fn();
const mockTodoFindPendingByUser = vi.fn().mockResolvedValue([]);
vi.mock("../db/repositories/todo.js", () => ({
    create: (...args) => mockTodoCreate(...args),
    update: (...args) => mockTodoUpdate(...args),
    findPendingByUser: (...args) => mockTodoFindPendingByUser(...args),
    findByUser: vi.fn().mockResolvedValue([]),
}));
const mockStrikeUpdate = vi.fn();
const mockStrikeFindById = vi.fn();
const mockStrikeUpdateStatus = vi.fn();
const mockStrikeFindByUser = vi.fn().mockResolvedValue([]);
vi.mock("../db/repositories/strike.js", () => ({
    update: (...args) => mockStrikeUpdate(...args),
    findById: (...args) => mockStrikeFindById(...args),
    updateStatus: (...args) => mockStrikeUpdateStatus(...args),
    findByUser: (...args) => mockStrikeFindByUser(...args),
}));
const mockGoalCreate = vi.fn();
const mockGoalUpdate = vi.fn();
const mockGoalFindActiveByUser = vi.fn().mockResolvedValue([]);
vi.mock("../db/repositories/goal.js", () => ({
    create: (...args) => mockGoalCreate(...args),
    update: (...args) => mockGoalUpdate(...args),
    findActiveByUser: (...args) => mockGoalFindActiveByUser(...args),
    findWithTodos: vi.fn().mockResolvedValue([]),
    findByUser: vi.fn().mockResolvedValue([]),
}));
const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
const mockExecute = vi.fn().mockResolvedValue(undefined);
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: (...args) => mockQueryOne(...args),
    execute: (...args) => mockExecute(...args),
}));
// ── Import after mocks ────────────────────────────────────────────────
const { projectIntendStrike, checkDuplicate, parseIntendField, } = await import("./todo-projector.js");
// ── Tests ─────────────────────────────────────────────────────────────
beforeEach(() => {
    vi.clearAllMocks();
});
describe("场景 1: 自然语言创建待办 — intend Strike 结构化投影", () => {
    it("should_extract_scheduled_start_from_strike_field", async () => {
        const strike = makeStrike({
            id: "s1",
            nucleus: "明天下午3点找张总确认报价",
            field: {
                granularity: "action",
                scheduled_start: "2026-03-26T15:00:00",
                person: "张总",
                priority: "high",
            },
        });
        const createdTodo = {
            id: "todo-1",
            record_id: "record-1",
            text: strike.nucleus,
            done: false,
            estimated_minutes: null,
            scheduled_start: "2026-03-26T15:00:00",
            scheduled_end: null,
            priority: 5,
            completed_at: null,
            created_at: new Date().toISOString(),
            strike_id: "s1",
        };
        mockTodoCreate.mockResolvedValue(createdTodo);
        mockTodoFindPendingByUser.mockResolvedValue([]); // 无重复
        const result = await projectIntendStrike(strike, "user-1");
        expect(mockTodoCreate).toHaveBeenCalledTimes(1);
        const arg = mockTodoCreate.mock.calls[0][0];
        expect(arg.strike_id).toBe("s1");
        expect(arg.text).toBe("明天下午3点找张总确认报价");
        expect(result).not.toBeNull();
    });
    it("should_set_high_priority_when_field_indicates_urgent", async () => {
        const strike = makeStrike({
            id: "s2",
            nucleus: "找张总确认报价，挺急的",
            field: {
                granularity: "action",
                priority: "high",
            },
        });
        mockTodoCreate.mockResolvedValue({ id: "t1" });
        mockTodoFindPendingByUser.mockResolvedValue([]);
        await projectIntendStrike(strike, "user-1");
        const arg = mockTodoCreate.mock.calls[0][0];
        // 从 field.priority 解析
        const parsed = parseIntendField(strike.field);
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
        const strike = makeStrike({
            id: "s-action",
            nucleus: "明天打个电话给张总",
            field: { granularity: "action" },
        });
        mockTodoCreate.mockResolvedValue({ id: "t1" });
        mockTodoFindPendingByUser.mockResolvedValue([]);
        const result = await projectIntendStrike(strike, "user-1");
        expect(mockTodoCreate).toHaveBeenCalledTimes(1);
        // action 粒度 → 创建 todo，不创建 goal
        expect(mockGoalCreate).not.toHaveBeenCalled();
        expect(result).not.toBeNull();
    });
    it("should_create_goal_when_granularity_is_goal", async () => {
        const strike = makeStrike({
            id: "s-goal",
            nucleus: "今年要把身体搞好",
            field: { granularity: "goal" },
        });
        mockGoalCreate.mockResolvedValue({ id: "g1" });
        mockTodoFindPendingByUser.mockResolvedValue([]);
        const result = await projectIntendStrike(strike, "user-1");
        // goal 粒度 → 创建 goal，不创建 todo
        expect(mockGoalCreate).toHaveBeenCalledTimes(1);
        const goalArg = mockGoalCreate.mock.calls[0][0];
        expect(goalArg.title).toBe("今年要把身体搞好");
        expect(mockTodoCreate).not.toHaveBeenCalled();
    });
    it("should_create_goal_when_granularity_is_project", async () => {
        const strike = makeStrike({
            id: "s-proj",
            nucleus: "做一个供应链管理系统",
            field: { granularity: "project" },
        });
        mockGoalCreate.mockResolvedValue({ id: "g2" });
        mockTodoFindPendingByUser.mockResolvedValue([]);
        const result = await projectIntendStrike(strike, "user-1");
        expect(mockGoalCreate).toHaveBeenCalledTimes(1);
        expect(mockTodoCreate).not.toHaveBeenCalled();
    });
    it("should_default_to_action_when_no_granularity", async () => {
        const strike = makeStrike({
            id: "s-default",
            nucleus: "买菜",
            field: {},
        });
        mockTodoCreate.mockResolvedValue({ id: "t2" });
        mockTodoFindPendingByUser.mockResolvedValue([]);
        await projectIntendStrike(strike, "user-1");
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
        expect(result.id).toBe("t-existing");
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
//# sourceMappingURL=smart-todo.test.js.map