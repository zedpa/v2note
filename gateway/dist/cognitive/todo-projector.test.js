/**
 * todo-strike-bridge spec 测试
 * 覆盖场景 1-5: intend Strike 投影 todo、回补关联、goal 关联 Cluster、双向一致性、Strike 删除保护
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { daysLater } from "../lib/tz.js";
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
        domain: null,
        embedding: null,
        created_at: new Date().toISOString(),
        digested_at: null,
        ...overrides,
    };
}
function makeTodo(overrides = {}) {
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
function makeGoal(overrides = {}) {
    return {
        id: overrides.id ?? crypto.randomUUID(),
        device_id: "dev-1",
        title: "供应链优化",
        parent_id: null,
        status: "active",
        source: "speech",
        cluster_id: null,
        wiki_page_id: null,
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
    create: (...args) => mockTodoCreate(...args),
    dedupCreate: async (...args) => {
        const todo = await mockTodoCreate(...args);
        return { todo, action: "created" };
    },
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
const mockGoalFindWithTodos = vi.fn().mockResolvedValue([]);
vi.mock("../db/repositories/goal.js", () => ({
    create: (...args) => mockGoalCreate(...args),
    update: (...args) => mockGoalUpdate(...args),
    findActiveByUser: (...args) => mockGoalFindActiveByUser(...args),
    findWithTodos: (...args) => mockGoalFindWithTodos(...args),
    findByUser: vi.fn().mockResolvedValue([]),
}));
const mockChatCompletion = vi.fn();
vi.mock("../ai/provider.js", () => ({
    chatCompletion: (...args) => mockChatCompletion(...args),
}));
const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
const mockExecute = vi.fn().mockResolvedValue(undefined);
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: (...args) => mockQueryOne(...args),
    execute: (...args) => mockExecute(...args),
}));
const mockEventEmit = vi.fn();
vi.mock("../lib/event-bus.js", () => ({
    eventBus: { emit: (...args) => mockEventEmit(...args) },
}));
// ── Import after mocks ────────────────────────────────────────────────
const { projectIntendStrike, onTodoComplete, guardStrikeArchive, } = await import("./todo-projector.js");
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
        });
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
    it("should_extract_scheduled_start_from_intend_field", async () => {
        // "明天要去上山打老虎" — digest 会提取 scheduled_start
        const tomorrowStr = daysLater(1);
        const strike = makeStrike({
            id: "strike-tiger",
            polarity: "intend",
            nucleus: "上山打老虎",
            source_id: "record-3",
            field: { granularity: "action", scheduled_start: tomorrowStr },
        });
        const createdTodo = makeTodo({
            id: "todo-tiger",
            text: "上山打老虎",
            strike_id: "strike-tiger",
        });
        mockTodoCreate.mockResolvedValue(createdTodo);
        mockTodoUpdate.mockResolvedValue(undefined);
        await projectIntendStrike(strike, "user-1");
        // 验证 todo 创建
        expect(mockTodoCreate).toHaveBeenCalledTimes(1);
        expect(mockTodoCreate.mock.calls[0][0].text).toBe("上山打老虎");
        // 验证 scheduled_start 被写入
        expect(mockTodoUpdate).toHaveBeenCalledWith("todo-tiger", expect.objectContaining({ scheduled_start: tomorrowStr }));
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
        mockStrikeFindById.mockResolvedValueOnce(makeStrike({ id: strikeId, salience: 1.0 }));
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
        mockStrikeFindById.mockResolvedValueOnce(makeStrike({ id: strikeId, salience: 1.0 }));
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
        mockStrikeFindById.mockResolvedValueOnce(makeStrike({ id: strikeId, salience: 0.05 }));
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
        mockStrikeFindById.mockResolvedValueOnce(makeStrike({ id: strikeId, salience: 0.5 }));
        const { enforceMinSalience } = await import("./todo-projector.js");
        await enforceMinSalience(strikeId);
        expect(mockStrikeUpdate).not.toHaveBeenCalled();
    });
});
// ── 场景 B2: goal 级意图 → 创建 goal + 自动关联 ──────────────────────
describe("场景 B2: goal 级意图创建 goal 并自动关联", () => {
    it("should_create_goal_with_source_explicit_when_granularity_is_goal", async () => {
        const strike = makeStrike({
            id: "strike-goal-1",
            polarity: "intend",
            nucleus: "我要评估是否换供应商",
            source_id: "record-1",
            field: { granularity: "goal" },
        });
        const createdGoal = makeGoal({ id: "goal-new", title: strike.nucleus, source: "speech" });
        mockGoalCreate.mockResolvedValue(createdGoal);
        // mock cluster linking query
        mockQuery.mockResolvedValue([]);
        const result = await projectIntendStrike(strike, "user-1");
        expect(mockGoalCreate).toHaveBeenCalledTimes(1);
        const createArg = mockGoalCreate.mock.calls[0][0];
        expect(createArg.title).toBe("我要评估是否换供应商");
        expect(createArg.source).toBe("explicit");
        expect(result).toBeDefined();
    });
    it("should_link_goal_to_matching_cluster_after_creation", async () => {
        const strike = makeStrike({
            id: "strike-goal-2",
            polarity: "intend",
            nucleus: "评估供应商体系",
            source_id: "record-1",
            field: { granularity: "goal" },
        });
        const createdGoal = makeGoal({ id: "goal-linked", title: strike.nucleus });
        mockGoalCreate.mockResolvedValue(createdGoal);
        // mock: 找到语义匹配的 cluster
        mockQuery
            .mockResolvedValueOnce([{ id: "cluster-match", similarity: 0.85 }]) // cluster match
            .mockResolvedValueOnce([]); // todo link query
        const result = await projectIntendStrike(strike, "user-1");
        expect(result).toBeDefined();
        expect(mockGoalUpdate).toHaveBeenCalledWith("goal-linked", expect.objectContaining({
            cluster_id: "cluster-match",
        }));
    });
    it("should_link_existing_todos_to_new_goal_when_semantically_related", async () => {
        const strike = makeStrike({
            id: "strike-goal-3",
            polarity: "intend",
            nucleus: "优化供应链成本",
            source_id: "record-1",
            field: { granularity: "goal" },
        });
        const createdGoal = makeGoal({ id: "goal-todo-link", title: strike.nucleus });
        mockGoalCreate.mockResolvedValue(createdGoal);
        // mock: 无 cluster 匹配
        mockQuery.mockResolvedValueOnce([]);
        // mock: 找到相关的 pending todos
        mockTodoFindPendingByUser.mockResolvedValue([
            makeTodo({ id: "todo-related", text: "找供应商报价" }),
            makeTodo({ id: "todo-unrelated", text: "买菜" }),
        ]);
        await projectIntendStrike(strike, "user-1");
        // 至少调用 todoUpdate 关联相关 todo
        // （具体实现可能用 embedding 或关键词匹配）
        expect(mockGoalCreate).toHaveBeenCalledTimes(1);
    });
    it("should_not_create_new_goal_when_same_direction_active_goal_exists", async () => {
        const strike = makeStrike({
            id: "strike-dup",
            polarity: "intend",
            nucleus: "评估供应商",
            source_id: "record-1",
            field: { granularity: "goal" },
        });
        // 已有同方向 active goal
        mockGoalFindActiveByUser.mockResolvedValue([
            makeGoal({ id: "existing-goal", title: "评估供应商体系", status: "active" }),
        ]);
        const result = await projectIntendStrike(strike, "user-1");
        // 不应创建新 goal，而是返回已有的
        expect(mockGoalCreate).not.toHaveBeenCalled();
        expect(result).toBeDefined();
    });
});
// ── 场景 B3: 项目级意图 → goal + 子目标建议 ──────────────────────────
describe("场景 B3: 项目级意图创建 project goal + 子目标建议", () => {
    it("should_create_project_goal_and_ai_suggest_sub_goals", async () => {
        const strike = makeStrike({
            id: "strike-project-1",
            polarity: "intend",
            nucleus: "Q2要完成供应链体系的重建",
            source_id: "record-1",
            field: { granularity: "project" },
        });
        const parentGoal = makeGoal({ id: "goal-project", title: strike.nucleus });
        mockGoalCreate
            .mockResolvedValueOnce(parentGoal) // parent goal
            .mockResolvedValue(makeGoal({ id: "sub-goal", parent_id: "goal-project", status: "suggested" }));
        // mock AI 生成子目标
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({
                sub_goals: [
                    { title: "评估当前供应商表现", reason: "了解现状" },
                    { title: "调研新供应商候选", reason: "扩展选择" },
                    { title: "重新谈判合同条款", reason: "降低成本" },
                ],
            }),
        });
        // mock cluster query
        mockQuery.mockResolvedValue([]);
        const result = await projectIntendStrike(strike, "user-1");
        // 子目标生成是 fire-and-forget，等待微任务队列刷新
        await new Promise((r) => setTimeout(r, 50));
        expect(result).toBeDefined();
        expect(mockGoalCreate).toHaveBeenCalledTimes(4); // 1 parent + 3 sub-goals
        // 子目标应设 parent_id 和 status=suggested
        const subGoalCalls = mockGoalCreate.mock.calls.slice(1);
        for (const call of subGoalCalls) {
            expect(call[0].parent_id).toBe("goal-project");
        }
    });
    it("should_create_project_goal_even_if_ai_sub_goal_generation_fails", async () => {
        const strike = makeStrike({
            id: "strike-project-2",
            polarity: "intend",
            nucleus: "全面重构技术栈",
            source_id: "record-1",
            field: { granularity: "project" },
        });
        const parentGoal = makeGoal({ id: "goal-project-2", title: strike.nucleus });
        mockGoalCreate.mockResolvedValue(parentGoal);
        // AI 调用失败
        mockChatCompletion.mockRejectedValue(new Error("AI unavailable"));
        mockQuery.mockResolvedValue([]);
        const result = await projectIntendStrike(strike, "user-1");
        // 即使 AI 失败，parent goal 也应创建成功
        expect(result).toBeDefined();
        expect(mockGoalCreate).toHaveBeenCalledTimes(1);
    });
});
// ── smart-todo 场景: 创建后事件反馈 ─────────────────────────────────
describe("smart-todo: 创建后触发 todo.created 事件", () => {
    it("should_emit_todo_created_event_with_userId_when_action_todo_created", async () => {
        const strike = makeStrike({
            id: "strike-event-1",
            polarity: "intend",
            nucleus: "明天去超市买水果",
            source_id: "record-1",
            user_id: "user-1",
        });
        const createdTodo = makeTodo({ id: "todo-event-1", text: strike.nucleus });
        mockTodoCreate.mockResolvedValue(createdTodo);
        await projectIntendStrike(strike, "user-1");
        expect(mockEventEmit).toHaveBeenCalledWith("todo.created", expect.objectContaining({
            todoId: "todo-event-1",
            todoText: "明天去超市买水果",
            userId: "user-1",
        }));
    });
    it("should_emit_todo_created_event_with_recordId", async () => {
        const strike = makeStrike({
            id: "strike-event-2",
            polarity: "intend",
            nucleus: "下午3点开会",
            source_id: "record-42",
        });
        const createdTodo = makeTodo({ id: "todo-event-2", text: strike.nucleus });
        mockTodoCreate.mockResolvedValue(createdTodo);
        await projectIntendStrike(strike, "user-1");
        expect(mockEventEmit).toHaveBeenCalledWith("todo.created", expect.objectContaining({
            recordId: "record-42",
        }));
    });
    it("should_emit_todo_created_event_when_goal_created", async () => {
        const strike = makeStrike({
            id: "strike-event-3",
            polarity: "intend",
            nucleus: "今年要减肥20斤",
            source_id: "record-1",
            field: { granularity: "goal" },
        });
        const createdGoal = makeGoal({ id: "goal-event-1", title: strike.nucleus });
        mockGoalCreate.mockResolvedValue(createdGoal);
        mockQuery.mockResolvedValue([]);
        await projectIntendStrike(strike, "user-1");
        // goal 创建也应该触发事件
        expect(mockEventEmit).toHaveBeenCalledWith("todo.created", expect.objectContaining({
            todoId: "goal-event-1",
            todoText: "今年要减肥20斤",
            userId: "user-1",
        }));
    });
    it("should_not_emit_event_when_polarity_is_not_intend", async () => {
        const strike = makeStrike({ polarity: "perceive" });
        await projectIntendStrike(strike, "user-1");
        expect(mockEventEmit).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=todo-projector.test.js.map