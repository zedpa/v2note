/**
 * createWithDedup 去重机制测试
 *
 * 验证目标创建时的语义去重：
 * - 完全相同文本 → matched（不创建）
 * - 语义相似 ≥ 0.75 → matched
 * - 中等相似 0.5-0.75 → suggested
 * - 不相似 < 0.5 → created
 * - embedding 失败时降级为直接创建
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mock 数据库和 embedding ──
const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockExecute = vi.fn();
vi.mock("../pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: (...args) => mockQueryOne(...args),
    execute: (...args) => mockExecute(...args),
}));
const mockGetEmbedding = vi.fn();
const mockCosineSimilarity = vi.fn();
vi.mock("../../memory/embeddings.js", () => ({
    getEmbedding: (...args) => mockGetEmbedding(...args),
    cosineSimilarity: (...args) => mockCosineSimilarity(...args),
}));
import { createWithDedup } from "./todo.js";
const baseParams = {
    user_id: "user-1",
    device_id: "dev-1",
    text: "学习英语",
    level: 1,
};
function makeTodo(text, id) {
    return {
        id: id ?? crypto.randomUUID(),
        record_id: null,
        text,
        done: false,
        estimated_minutes: null,
        scheduled_start: null,
        scheduled_end: null,
        priority: 0,
        completed_at: null,
        created_at: new Date().toISOString(),
        level: 1,
        status: "active",
        domain: "学习",
    };
}
describe("createWithDedup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 默认：SELECT 无已有目标
        mockQuery.mockResolvedValue([]);
        // 默认：INSERT 返回新记录（createGoalAsTodo 用 queryOne）
        mockQueryOne.mockImplementation((_sql, params) => {
            return makeTodo(params?.[2] ?? baseParams.text);
        });
        mockExecute.mockResolvedValue(undefined);
    });
    it("should_create_new_goal_when_no_existing_goals", async () => {
        // 无已有目标 → 直接创建（mockQuery 默认返回空数组）
        const result = await createWithDedup(baseParams);
        expect(result.action).toBe("created");
        expect(result.todo.text).toBe("学习英语");
    });
    it("should_match_when_similarity_above_075", async () => {
        const existingGoal = makeTodo("学英语", "goal-existing");
        mockQuery.mockResolvedValue([existingGoal]);
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockCosineSimilarity.mockReturnValue(0.85); // > 0.75
        const result = await createWithDedup(baseParams);
        expect(result.action).toBe("matched");
        expect(result.todo.id).toBe("goal-existing");
        // 不应创建新记录
        const insertCalls = mockQuery.mock.calls.filter((c) => typeof c[0] === "string" && c[0].includes("INSERT"));
        expect(insertCalls).toHaveLength(0);
    });
    it("should_suggest_when_similarity_between_050_and_075", async () => {
        const existingGoal = makeTodo("提升英语水平", "goal-existing");
        mockQuery.mockResolvedValue([existingGoal]);
        // queryOne for INSERT returns suggested status
        mockQueryOne.mockImplementation((_sql, params) => ({
            ...makeTodo(params?.[2] ?? "学习英语"),
            status: params?.[4] ?? "suggested",
        }));
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockCosineSimilarity.mockReturnValue(0.62); // 0.5 ≤ sim < 0.75
        const result = await createWithDedup(baseParams);
        expect(result.action).toBe("suggested");
        expect(result.todo.status).toBe("suggested");
    });
    it("should_create_when_similarity_below_050", async () => {
        const existingGoal = makeTodo("买菜做饭", "goal-existing");
        mockQuery.mockResolvedValue([existingGoal]);
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockCosineSimilarity.mockReturnValue(0.2); // < 0.5
        const result = await createWithDedup(baseParams);
        expect(result.action).toBe("created");
    });
    it("should_create_without_dedup_when_embedding_fails", async () => {
        const existingGoal = makeTodo("学英语", "goal-existing");
        mockQuery.mockResolvedValue([existingGoal]);
        mockGetEmbedding.mockRejectedValue(new Error("Embedding service unavailable"));
        const result = await createWithDedup(baseParams);
        // 降级为直接创建，不阻断流程
        expect(result.action).toBe("created");
    });
    it("should_pick_best_match_among_multiple_existing_goals", async () => {
        const goals = [
            makeTodo("健身减脂", "goal-1"),
            makeTodo("学英语口语", "goal-2"),
            makeTodo("读书计划", "goal-3"),
        ];
        mockQuery.mockResolvedValue(goals);
        // 模拟每个目标的 embedding
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        // "学英语口语" 最相似
        let callIdx = 0;
        mockCosineSimilarity.mockImplementation(() => {
            const sims = [0.3, 0.82, 0.15]; // 健身, 英语口语, 读书
            return sims[callIdx++];
        });
        const result = await createWithDedup(baseParams);
        expect(result.action).toBe("matched");
        expect(result.todo.id).toBe("goal-2"); // 匹配到"学英语口语"
    });
    it("should_not_match_archived_or_completed_goals", async () => {
        // SELECT query 只查 active/progressing/suggested 状态
        mockQuery.mockImplementation((sql) => {
            // 验证 SQL 中包含状态过滤
            expect(sql).toContain("'active'");
            expect(sql).toContain("'progressing'");
            expect(sql).toContain("'suggested'");
            expect(sql).not.toContain("'archived'");
            return [];
        });
        const result = await createWithDedup(baseParams);
        expect(result.action).toBe("created");
    });
});
//# sourceMappingURL=todo-dedup.test.js.map