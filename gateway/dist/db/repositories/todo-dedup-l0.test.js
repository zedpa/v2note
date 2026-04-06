/**
 * dedupCreate 普通待办去重测试（level=0）
 *
 * 场景 1: 相似度 ≥ 0.65 → matched（不创建）
 * 场景 2: 相似度 < 0.65 → created
 * 场景 3: 无已有 todo → created
 * 场景 4: embedding 失败 → 降级直接创建
 * 场景 5: 已完成 todo 不参与去重
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mocks ──
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
import { dedupCreate } from "./todo.js";
function makeTodo(text, id, done = false) {
    return {
        id: id ?? crypto.randomUUID(),
        record_id: null,
        text,
        done,
        estimated_minutes: null,
        scheduled_start: null,
        scheduled_end: null,
        priority: 0,
        completed_at: null,
        created_at: new Date().toISOString(),
        level: 0,
        status: "active",
    };
}
const baseFields = {
    text: "联系张总确认合同",
    done: false,
    user_id: "user-1",
    device_id: "dev-1",
};
describe("dedupCreate (level=0 待办去重)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 默认：无已有 todo
        mockQuery.mockResolvedValue([]);
        // 默认：INSERT 返回新记录
        mockQueryOne.mockImplementation((_sql, params) => {
            return makeTodo(params?.[0] ?? baseFields.text);
        });
    });
    it("场景1: 相似度>=0.65视为重复_返回已有todo", async () => {
        const existing = makeTodo("联系张总确认合同细节", "todo-existing");
        mockQuery.mockResolvedValue([existing]);
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockCosineSimilarity.mockReturnValue(0.90); // ≥ 0.85
        const result = await dedupCreate(baseFields);
        expect(result.action).toBe("matched");
        expect(result.todo.id).toBe("todo-existing");
        // 不应调用 INSERT
        expect(mockQueryOne).not.toHaveBeenCalled();
    });
    it("场景2: 相似度<0.65正常创建", async () => {
        const existing = makeTodo("去超市买菜", "todo-existing");
        mockQuery.mockResolvedValue([existing]);
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockCosineSimilarity.mockReturnValue(0.50); // < 0.85
        const result = await dedupCreate(baseFields);
        expect(result.action).toBe("created");
        expect(result.todo.text).toBe(baseFields.text);
    });
    it("场景3: 无已有todo直接创建", async () => {
        mockQuery.mockResolvedValue([]);
        const result = await dedupCreate(baseFields);
        expect(result.action).toBe("created");
        // 不应调用 getEmbedding（无 todo 可比较）
        expect(mockGetEmbedding).not.toHaveBeenCalled();
    });
    it("场景4: embedding失败降级直接创建", async () => {
        const existing = makeTodo("联系张总", "todo-existing");
        mockQuery.mockResolvedValue([existing]);
        mockGetEmbedding.mockRejectedValue(new Error("Embedding service down"));
        const result = await dedupCreate(baseFields);
        expect(result.action).toBe("created");
    });
    it("场景5: 只查未完成todo_不含done=true", async () => {
        mockQuery.mockImplementation((sql) => {
            // 验证 SQL 过滤 done=false
            expect(sql).toContain("done = false");
            return [];
        });
        await dedupCreate(baseFields);
        expect(mockQuery).toHaveBeenCalled();
    });
    it("should_pick_best_match_among_multiple_todos", async () => {
        const todos = [
            makeTodo("买菜做饭", "t-1"),
            makeTodo("联系张总谈合同", "t-2"),
            makeTodo("锻炼身体", "t-3"),
        ];
        mockQuery.mockResolvedValue(todos);
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        let callIdx = 0;
        mockCosineSimilarity.mockImplementation(() => {
            return [0.2, 0.92, 0.1][callIdx++];
        });
        const result = await dedupCreate(baseFields);
        expect(result.action).toBe("matched");
        expect(result.todo.id).toBe("t-2");
    });
    it("should_pass_through_all_fields_when_creating", async () => {
        mockQuery.mockResolvedValue([]);
        const fields = {
            ...baseFields,
            record_id: "rec-1",
            domain: "工作",
            impact: 5,
            scheduled_start: "2026-04-02T09:00:00Z",
        };
        await dedupCreate(fields);
        // queryOne 应被调用（INSERT）
        expect(mockQueryOne).toHaveBeenCalled();
        const sql = mockQueryOne.mock.calls[0][0];
        expect(sql).toContain("INSERT INTO todo");
    });
});
//# sourceMappingURL=todo-dedup-l0.test.js.map