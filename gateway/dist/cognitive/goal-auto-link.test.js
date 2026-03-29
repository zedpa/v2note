/**
 * goal-auto-link spec 测试
 * 场景 1: 全量关联 | 场景 2: 增量关联 | 场景 4: 项目进度汇总
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mock helpers ──────────────────────────────────────────────────────
function makeGoal(overrides = {}) {
    return {
        id: overrides.id ?? crypto.randomUUID(),
        device_id: "dev-1",
        title: "评估供应商",
        parent_id: null,
        status: "active",
        source: "explicit",
        cluster_id: null,
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
    findById: (...args) => mockGoalFindById(...args),
    findActiveByUser: (...args) => mockGoalFindActiveByUser(...args),
    update: (...args) => mockGoalUpdate(...args),
    findWithTodos: (...args) => mockGoalFindWithTodos(...args),
    findByUser: (...args) => mockGoalFindByUser(...args),
    create: vi.fn(),
}));
const mockTodoUpdate = vi.fn();
vi.mock("../db/repositories/todo.js", () => ({
    update: (...args) => mockTodoUpdate(...args),
    findPendingByUser: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    findByUser: vi.fn().mockResolvedValue([]),
}));
const mockQuery = vi.fn().mockResolvedValue([]);
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
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
    mockQuery.mockResolvedValue([]);
    mockGoalFindActiveByUser.mockResolvedValue([]);
    mockGoalFindWithTodos.mockResolvedValue([]);
});
describe("场景 1: 目标创建后全量关联扫描", () => {
    it("should_link_goal_to_matching_cluster", async () => {
        const goalId = "goal-1";
        // goal 没有 cluster_id → 需要关联
        mockGoalFindById.mockResolvedValue(makeGoal({ id: goalId, cluster_id: null }));
        // goalAutoLink 调用顺序:
        // query 1: cluster 匹配
        // query 2: 相关记录
        // query 3: 相关 todo
        mockQuery
            .mockResolvedValueOnce([{ id: "cluster-1", similarity: 0.85 }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        const result = await goalAutoLink(goalId, "user-1");
        expect(result.clusterLinked).toBe(true);
        expect(mockGoalUpdate).toHaveBeenCalledWith(goalId, expect.objectContaining({
            cluster_id: "cluster-1",
        }));
    });
    it("should_link_related_todos_to_goal", async () => {
        const goalId = "goal-2";
        // goal 已有 cluster → 跳过 cluster 关联
        mockGoalFindById.mockResolvedValue(makeGoal({ id: goalId, title: "供应链优化", cluster_id: "c1" }));
        // goalAutoLink 调用顺序（cluster 已有，跳过 query 1）:
        // query 1: 相关记录
        // query 2: 相关 todo
        mockQuery
            .mockResolvedValueOnce([]) // 相关记录
            .mockResolvedValueOnce([
            { id: "todo-1", text: "找供应商报价", similarity: 0.75 },
        ]);
        const result = await goalAutoLink(goalId, "user-1");
        expect(result.todosLinked).toBe(1);
        expect(mockTodoUpdate).toHaveBeenCalledWith("todo-1", { goal_id: goalId });
    });
    it("should_count_related_records", async () => {
        const goalId = "goal-3";
        // goal 已有 cluster
        mockGoalFindById.mockResolvedValue(makeGoal({ id: goalId, cluster_id: "c1" }));
        // 跳过 cluster query，直接:
        // query 1: 相关记录（3条）
        // query 2: 相关 todo
        mockQuery
            .mockResolvedValueOnce([{ id: "rec-1" }, { id: "rec-2" }, { id: "rec-3" }])
            .mockResolvedValueOnce([]);
        const result = await goalAutoLink(goalId, "user-1");
        expect(result.recordsFound).toBe(3);
    });
});
describe("场景 2: 新日记自动关联已有目标", () => {
    it("should_link_new_strike_to_matching_goal_cluster", async () => {
        const activeGoals = [
            makeGoal({ id: "goal-1", title: "评估供应商", cluster_id: "cluster-1" }),
        ];
        mockGoalFindActiveByUser.mockResolvedValue(activeGoals);
        // query: Strike vs goal cluster embedding 匹配
        mockQuery.mockResolvedValueOnce([
            { goal_id: "goal-1", similarity: 0.72 },
        ]);
        const result = await linkNewStrikesToGoals([{ id: "strike-new", source_id: "record-1" }], "user-1");
        expect(result.linked).toBe(1);
    });
    it("should_not_link_when_similarity_below_threshold", async () => {
        const activeGoals = [
            makeGoal({ id: "goal-1", title: "评估供应商", cluster_id: "cluster-1" }),
        ];
        mockGoalFindActiveByUser.mockResolvedValue(activeGoals);
        // 匹配度低于 0.6
        mockQuery.mockResolvedValueOnce([
            { goal_id: "goal-1", similarity: 0.4 },
        ]);
        const result = await linkNewStrikesToGoals([{ id: "strike-unrelated", source_id: "record-2" }], "user-1");
        expect(result.linked).toBe(0);
    });
    it("should_skip_strikes_without_source_id", async () => {
        const activeGoals = [
            makeGoal({ id: "goal-1", cluster_id: "cluster-1" }),
        ];
        mockGoalFindActiveByUser.mockResolvedValue(activeGoals);
        const result = await linkNewStrikesToGoals([{ id: "strike-orphan", source_id: null }], "user-1");
        expect(result.linked).toBe(0);
        expect(mockQuery).not.toHaveBeenCalled();
    });
});
describe("场景 4: 项目级子目标进度汇总", () => {
    it("should_aggregate_child_goals_with_todo_progress", async () => {
        const projectId = "project-1";
        // 3 个子目标
        mockGoalFindByUser.mockResolvedValue([
            makeGoal({ id: "sub-1", parent_id: projectId, title: "评估供应商", status: "progressing" }),
            makeGoal({ id: "sub-2", parent_id: projectId, title: "谈判合同", status: "blocked" }),
            makeGoal({ id: "sub-3", parent_id: projectId, title: "供应商切换", status: "active" }),
        ]);
        // sub-1: 2/3 完成
        mockGoalFindWithTodos
            .mockResolvedValueOnce([
            { id: "t1", done: true }, { id: "t2", done: true }, { id: "t3", done: false },
        ])
            // sub-2: 0/1 完成
            .mockResolvedValueOnce([
            { id: "t4", done: false },
        ])
            // sub-3: 无 todo
            .mockResolvedValueOnce([]);
        const progress = await getProjectProgress(projectId, "user-1");
        expect(progress.children).toHaveLength(3);
        expect(progress.children[0].completionPercent).toBe(67); // 2/3
        expect(progress.children[1].status).toBe("blocked");
        expect(progress.totalTodos).toBe(4);
        expect(progress.completedTodos).toBe(2);
    });
});
//# sourceMappingURL=goal-auto-link.test.js.map