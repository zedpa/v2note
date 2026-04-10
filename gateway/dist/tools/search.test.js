import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock repositories
vi.mock("../db/repositories/index.js", () => ({
    recordRepo: {
        searchByUser: vi.fn(),
        search: vi.fn(),
    },
    summaryRepo: {
        findByRecordIds: vi.fn().mockResolvedValue([]),
    },
}));
// Mock db pool — goals/todos now use dbQuery directly
// Must use vi.hoisted so the variable is available when vi.mock factory runs
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock("../db/pool.js", () => ({
    query: mockQuery,
}));
import { unifiedSearch } from "./search.js";
import { recordRepo, summaryRepo } from "../db/repositories/index.js";
// Helper: 创建符合 Record 接口的 mock
function mockRecord(id, overrides) {
    return {
        id,
        device_id: "d1",
        status: "completed",
        source: "manual",
        audio_path: null,
        duration_seconds: null,
        location_text: null,
        notebook: null,
        source_type: "think",
        archived: false,
        digested: false,
        digested_at: null,
        created_at: "2026-03-20T10:00:00Z",
        updated_at: "2026-03-20T10:00:00Z",
        user_id: null,
        file_url: null,
        file_name: null,
        compile_status: "pending",
        content_hash: null,
        ...overrides,
    };
}
// goal/todo rows as returned by dbQuery (fields match the SELECT in search.ts)
function mockGoalRow(id, title) {
    return { id, title, status: "active", created_at: "2026-03-10" };
}
function mockTodoRow(id, text, done = false) {
    return { id, text, done, scheduled_start: null, domain: null, parent_id: null, created_at: "2026-03-20" };
}
describe("unifiedSearch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: dbQuery returns empty array (clusters search etc.)
        mockQuery.mockResolvedValue([]);
    });
    describe("场景 2: scope 筛选", () => {
        it("should_search_records_when_scope_is_records", async () => {
            vi.mocked(recordRepo.searchByUser).mockResolvedValue([mockRecord("r1")]);
            vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([
                { record_id: "r1", title: "供应商会议记录", short_summary: "今天和张总讨论了供应商切换" },
            ]);
            const results = await unifiedSearch({ query: "供应商", scope: "records" }, { userId: "u1", deviceId: "d1" });
            expect(recordRepo.searchByUser).toHaveBeenCalledWith("u1", "供应商");
            expect(results).toHaveLength(1);
            expect(results[0].type).toBe("record");
            expect(results[0].title).toBe("供应商会议记录");
        });
        it("should_search_goals_when_scope_is_goals", async () => {
            mockQuery.mockResolvedValue([
                mockGoalRow("g1", "Q2产品发布"),
                mockGoalRow("g2", "供应商评估"),
            ]);
            const results = await unifiedSearch({ query: "供应商", scope: "goals" }, { userId: "u1", deviceId: "d1" });
            expect(mockQuery).toHaveBeenCalledTimes(1);
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results.some((r) => r.title === "供应商评估")).toBe(true);
        });
        it("should_search_todos_when_scope_is_todos", async () => {
            mockQuery.mockResolvedValue([
                mockTodoRow("t1", "联系供应商A报价"),
                mockTodoRow("t2", "写周报"),
            ]);
            const results = await unifiedSearch({ query: "供应商", scope: "todos" }, { userId: "u1", deviceId: "d1" });
            expect(mockQuery).toHaveBeenCalledTimes(1);
            expect(results.some((r) => r.title === "联系供应商A报价")).toBe(true);
            expect(results.every((r) => r.title !== "写周报")).toBe(true);
        });
    });
    describe("scope=all 跨实体搜索", () => {
        it("should_search_across_all_entity_types", async () => {
            vi.mocked(recordRepo.searchByUser).mockResolvedValue([mockRecord("r1")]);
            vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([
                { record_id: "r1", title: "供应商日记", short_summary: "讨论供应商" },
            ]);
            // dbQuery is called for goals, todos, clusters (3 calls)
            // Use mockImplementation to differentiate by SQL content
            mockQuery.mockImplementation((sql) => {
                if (sql.includes("level >= 1")) {
                    return Promise.resolve([mockGoalRow("g1", "供应商评估")]);
                }
                if (sql.includes("level = 0")) {
                    return Promise.resolve([mockTodoRow("t1", "供应商报价")]);
                }
                return Promise.resolve([]); // clusters
            });
            const results = await unifiedSearch({ query: "供应商", scope: "all" }, { userId: "u1", deviceId: "d1" });
            const types = results.map((r) => r.type);
            expect(types).toContain("record");
            expect(types).toContain("goal");
            expect(types).toContain("todo");
        });
    });
    describe("limit 参数", () => {
        it("should_respect_limit_parameter", async () => {
            vi.mocked(recordRepo.searchByUser).mockResolvedValue(Array.from({ length: 20 }, (_, i) => mockRecord(`r${i}`)));
            vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([]);
            const results = await unifiedSearch({ query: "供应商", scope: "records", limit: 5 }, { userId: "u1", deviceId: "d1" });
            expect(results.length).toBeLessThanOrEqual(5);
        });
        it("should_default_to_10_results", async () => {
            vi.mocked(recordRepo.searchByUser).mockResolvedValue(Array.from({ length: 20 }, (_, i) => mockRecord(`r${i}`)));
            vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([]);
            const results = await unifiedSearch({ query: "记录", scope: "records" }, { userId: "u1", deviceId: "d1" });
            expect(results.length).toBeLessThanOrEqual(10);
        });
    });
    describe("fallback: deviceId 搜索", () => {
        it("should_fallback_to_device_search_when_no_userId", async () => {
            vi.mocked(recordRepo.search).mockResolvedValue([mockRecord("r1")]);
            vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([]);
            await unifiedSearch({ query: "测试", scope: "records" }, { deviceId: "d1" });
            expect(recordRepo.search).toHaveBeenCalledWith("d1", "测试");
            expect(recordRepo.searchByUser).not.toHaveBeenCalled();
        });
    });
    describe("空结果", () => {
        it("should_return_empty_array_when_no_matches", async () => {
            vi.mocked(recordRepo.searchByUser).mockResolvedValue([]);
            vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([]);
            // mockQuery already returns [] by default from beforeEach
            const results = await unifiedSearch({ query: "不存在的东西", scope: "all" }, { userId: "u1", deviceId: "d1" });
            expect(results).toEqual([]);
        });
    });
});
//# sourceMappingURL=search.test.js.map