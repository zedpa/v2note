/**
 * cognitive-report spec 测试
 * 覆盖场景 1/5: 结构化认知报告生成、无活动降级
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mocks ─────────────────────────────────────────────────────────────
const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: (...args) => mockQueryOne(...args),
    execute: vi.fn(),
}));
vi.mock("../db/repositories/index.js", () => ({
    strikeRepo: { findActive: vi.fn().mockResolvedValue([]) },
    bondRepo: { findByType: vi.fn().mockResolvedValue([]) },
    todoRepo: {
        findByUser: vi.fn().mockResolvedValue([]),
        findCompletedToday: vi.fn().mockResolvedValue([]),
    },
}));
// =====================================================================
// 场景 1: 结构化认知报告
// =====================================================================
describe("场景1: 结构化认知报告", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should_generate_report_with_polarity_distribution", async () => {
        const { generateCognitiveReport } = await import("./report.js");
        // Mock 今日 strikes 极性分布
        mockQuery.mockImplementation((sql) => {
            if (sql.includes("polarity") && sql.includes("COUNT")) {
                return Promise.resolve([
                    { polarity: "perceive", count: "5" },
                    { polarity: "judge", count: "3" },
                    { polarity: "realize", count: "1" },
                    { polarity: "intend", count: "2" },
                    { polarity: "feel", count: "1" },
                ]);
            }
            if (sql.includes("contradiction")) {
                return Promise.resolve([]);
            }
            if (sql.includes("is_cluster")) {
                return Promise.resolve([]);
            }
            if (sql.includes("todo") && sql.includes("done")) {
                return Promise.resolve([{ total: "10", done: "4" }]);
            }
            return Promise.resolve([]);
        });
        const report = await generateCognitiveReport("user-1");
        expect(report.today_strikes).toBeDefined();
        expect(report.today_strikes.perceive).toBe(5);
        expect(report.today_strikes.judge).toBe(3);
        expect(report.today_strikes.realize).toBe(1);
        expect(report.today_strikes.intend).toBe(2);
        expect(report.today_strikes.feel).toBe(1);
    });
    it("should_include_contradictions_max_5", async () => {
        const { generateCognitiveReport } = await import("./report.js");
        // 6 条矛盾
        const contradictions = Array.from({ length: 6 }, (_, i) => ({
            a_nucleus: `观点A-${i}`,
            b_nucleus: `观点B-${i}`,
            strength: 0.7,
        }));
        mockQuery.mockImplementation((sql) => {
            if (sql.includes("polarity") && sql.includes("COUNT")) {
                return Promise.resolve([]);
            }
            if (sql.includes("contradiction")) {
                return Promise.resolve(contradictions);
            }
            return Promise.resolve([]);
        });
        const report = await generateCognitiveReport("user-1");
        expect(report.contradictions.length).toBeLessThanOrEqual(5);
    });
    it("should_include_behavior_drift", async () => {
        const { generateCognitiveReport } = await import("./report.js");
        mockQuery.mockImplementation((sql) => {
            if (sql.includes("polarity") && sql.includes("intend")) {
                return Promise.resolve([{ count: "8" }]);
            }
            if (sql.includes("polarity") && sql.includes("COUNT")) {
                return Promise.resolve([{ polarity: "intend", count: "8" }]);
            }
            if (sql.includes("todo")) {
                return Promise.resolve([{ total: "10", done: "3" }]);
            }
            return Promise.resolve([]);
        });
        const report = await generateCognitiveReport("user-1");
        expect(report.behavior_drift).toBeDefined();
        expect(report.behavior_drift.intend_count).toBeTypeOf("number");
    });
});
// =====================================================================
// 场景 5: 无活动日降级
// =====================================================================
describe("场景5: 无活动日降级", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should_return_empty_report_when_no_activity", async () => {
        const { generateCognitiveReport } = await import("./report.js");
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);
        const report = await generateCognitiveReport("user-1");
        expect(report.today_strikes.perceive).toBe(0);
        expect(report.contradictions).toEqual([]);
        expect(report.cluster_changes).toEqual([]);
        expect(report.is_empty).toBe(true);
    });
});
//# sourceMappingURL=report.test.js.map