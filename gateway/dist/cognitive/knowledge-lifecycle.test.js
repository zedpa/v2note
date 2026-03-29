/**
 * knowledge-lifecycle spec 测试
 * 场景 1: 过期扫描 | 场景 2: evolution bond | 场景 3: 撤销 supersede
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mocks ─────────────────────────────────────────────────────────────
const mockQuery = vi.fn().mockResolvedValue([]);
const mockExecute = vi.fn().mockResolvedValue(0);
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: (...args) => mockExecute(...args),
}));
const mockStrikeUpdateStatus = vi.fn();
const mockStrikeUpdate = vi.fn();
vi.mock("../db/repositories/strike.js", () => ({
    updateStatus: (...args) => mockStrikeUpdateStatus(...args),
    update: (...args) => mockStrikeUpdate(...args),
    findById: vi.fn().mockResolvedValue(null),
}));
// ── Import after mocks ────────────────────────────────────────────────
const { scanExpiredFacts, getSupersedAlerts, undoSupersede } = await import("./knowledge-lifecycle.js");
// ── Tests ─────────────────────────────────────────────────────────────
beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(0);
});
describe("场景 1: 过期事实检测", () => {
    it("should_find_old_perceive_strikes_with_newer_contradicting_info", async () => {
        // 找到过期的 perceive strike
        mockQuery.mockResolvedValueOnce([
            {
                old_id: "s-old",
                old_nucleus: "铝价涨了15%",
                new_id: "s-new",
                new_nucleus: "铝价已跌",
                similarity: 0.82,
            },
        ]);
        const expired = await scanExpiredFacts("user-1");
        expect(expired).toHaveLength(1);
        expect(expired[0].oldId).toBe("s-old");
        expect(expired[0].newId).toBe("s-new");
    });
    it("should_return_empty_when_no_expired_facts", async () => {
        mockQuery.mockResolvedValueOnce([]);
        const expired = await scanExpiredFacts("user-1");
        expect(expired).toHaveLength(0);
    });
});
describe("场景 1 alert: 过期确认提示", () => {
    it("should_generate_alerts_for_superseded_strikes", async () => {
        mockQuery.mockResolvedValueOnce([
            {
                id: "s-old",
                nucleus: "铝价涨了15%",
                superseded_by: "s-new",
                new_nucleus: "铝价已跌回去",
                superseded_at: "2026-03-20",
            },
        ]);
        const alerts = await getSupersedAlerts("user-1");
        expect(alerts).toHaveLength(1);
        expect(alerts[0].description).toContain("铝价涨了15%");
        expect(alerts[0].type).toBe("superseded");
    });
});
describe("场景 3: 撤销 supersede", () => {
    it("should_restore_strike_to_active_and_clear_superseded_by", async () => {
        await undoSupersede("s-old");
        expect(mockExecute).toHaveBeenCalled();
        const sql = mockExecute.mock.calls[0][0];
        expect(sql).toContain("active");
        expect(sql).toContain("superseded_by");
    });
});
//# sourceMappingURL=knowledge-lifecycle.test.js.map