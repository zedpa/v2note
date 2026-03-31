/**
 * action-tracking spec 测试
 * 场景 3: 行为统计 | 场景 4: 跳过 alert | 场景 5: 结果追踪提示
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mocks ─────────────────────────────────────────────────────────────
const mockQuery = vi.fn().mockResolvedValue([]);
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn(),
}));
// ── Import after mocks ────────────────────────────────────────────────
const { getActionStats, getSkipAlerts, getResultTrackingPrompts } = await import("./action-tracking.js");
// ── Tests ─────────────────────────────────────────────────────────────
beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
});
describe("场景 3: 行为模式分析", () => {
    it("should_return_completion_rate_and_skip_distribution", async () => {
        // mock action_event 统计
        mockQuery
            // 总计统计
            .mockResolvedValueOnce([
            { type: "complete", count: "20" },
            { type: "skip", count: "8" },
            { type: "resume", count: "2" },
        ])
            // 跳过原因分布
            .mockResolvedValueOnce([
            { reason: "resistance", count: "4" },
            { reason: "later", count: "3" },
            { reason: "wait", count: "1" },
        ])
            // 按目标完成率
            .mockResolvedValueOnce([
            { goal_id: "g1", goal_title: "供应链", total: "10", completed: "7" },
            { goal_id: "g2", goal_title: "团队", total: "5", completed: "2" },
        ])
            // 完成时间段分布
            .mockResolvedValueOnce([
            { hour: "9", count: "5" },
            { hour: "14", count: "8" },
            { hour: "21", count: "7" },
        ]);
        const stats = await getActionStats({ userId: "user-1" }, 14);
        expect(stats.totalEvents).toBe(30);
        expect(stats.completionRate).toBeCloseTo(0.67, 1); // 20/30
        expect(stats.skipReasons).toHaveLength(3);
        expect(stats.skipReasons[0].reason).toBe("resistance");
        expect(stats.goalStats).toHaveLength(2);
        expect(stats.timeDistribution).toHaveLength(3);
    });
    it("should_handle_empty_stats", async () => {
        mockQuery.mockResolvedValue([]);
        const stats = await getActionStats({ userId: "user-1" }, 14);
        expect(stats.totalEvents).toBe(0);
        expect(stats.completionRate).toBe(0);
    });
});
describe("场景 4: 跳过回流 — skip 3+ alert", () => {
    it("should_generate_alerts_for_todos_skipped_3_or_more_times", async () => {
        // 查找 skip_count >= 3 的 todo
        mockQuery.mockResolvedValueOnce([
            { id: "todo-1", text: "审阅小李报告", skip_count: "3", goal_title: "团队管理" },
            { id: "todo-2", text: "确认供应商报价", skip_count: "5", goal_title: "供应链" },
        ]);
        const alerts = await getSkipAlerts({ userId: "user-1" });
        expect(alerts).toHaveLength(2);
        expect(alerts[0].todoText).toBe("审阅小李报告");
        expect(alerts[0].skipCount).toBe(3);
        expect(alerts[0].description).toContain("3");
    });
    it("should_return_empty_when_no_high_skip_todos", async () => {
        mockQuery.mockResolvedValueOnce([]);
        const alerts = await getSkipAlerts({ userId: "user-1" });
        expect(alerts).toHaveLength(0);
    });
});
describe("场景 5: 结果追踪提示", () => {
    it("should_find_completed_todos_older_than_7_days_with_active_goal", async () => {
        // 查找完成 7+ 天、goal 仍 active 的 todo
        mockQuery.mockResolvedValueOnce([
            {
                id: "todo-1",
                text: "打给张总确认报价",
                completed_at: "2026-03-15T10:00:00Z",
                goal_id: "g1",
                goal_title: "供应链优化",
            },
        ]);
        const prompts = await getResultTrackingPrompts({ userId: "user-1" });
        expect(prompts).toHaveLength(1);
        expect(prompts[0].todoText).toBe("打给张总确认报价");
        expect(prompts[0].prompt).toContain("打给张总确认报价");
    });
    it("should_return_empty_when_no_qualifying_todos", async () => {
        mockQuery.mockResolvedValueOnce([]);
        const prompts = await getResultTrackingPrompts({ userId: "user-1" });
        expect(prompts).toHaveLength(0);
    });
});
//# sourceMappingURL=action-tracking.test.js.map