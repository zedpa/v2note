/**
 * agent-tool-layer spec 补全测试
 * unmet_request + confirm自主度
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mocks ─────────────────────────────────────────────────────────────
const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
const mockExecute = vi.fn();
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: (...args) => mockQueryOne(...args),
    execute: (...args) => mockExecute(...args),
}));
vi.mock("../db/repositories/index.js", () => ({
    recordRepo: { search: vi.fn().mockResolvedValue([]), searchByUser: vi.fn().mockResolvedValue([]) },
    goalRepo: { findActiveByUser: vi.fn().mockResolvedValue([]), findActiveByDevice: vi.fn().mockResolvedValue([]) },
    todoRepo: { findPendingByUser: vi.fn().mockResolvedValue([]), findPendingByDevice: vi.fn().mockResolvedValue([]) },
    summaryRepo: { findByRecordIds: vi.fn().mockResolvedValue([]) },
}));
// =====================================================================
// unmet_request 记录
// =====================================================================
describe("unmet_request 记录", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    it("should_record_unmet_request_to_database", async () => {
        const { recordUnmetRequest } = await import("./unmet-request.js");
        await recordUnmetRequest({
            userId: "user-1",
            requestText: "帮我订机票",
            failureReason: "no_matching_tool",
        });
        expect(mockExecute).toHaveBeenCalled();
        const sql = mockExecute.mock.calls[0][0];
        expect(sql).toContain("unmet_request");
        expect(sql).toContain("INSERT");
    });
});
// =====================================================================
// confirm 自主度
// =====================================================================
describe("confirm 自主度", () => {
    it("should_have_confirm_autonomy_on_destructive_tools", async () => {
        const { createDefaultRegistry } = await import("./definitions/index.js");
        const registry = createDefaultRegistry();
        // create_goal 和 delete_record 应为 confirm
        expect(registry.getAutonomy("create_goal")).toBe("confirm");
        expect(registry.getAutonomy("delete_record")).toBe("confirm");
    });
    it("should_have_silent_autonomy_on_search", async () => {
        const { createDefaultRegistry } = await import("./definitions/index.js");
        const registry = createDefaultRegistry();
        expect(registry.getAutonomy("search")).toBe("silent");
    });
    it("should_have_notify_autonomy_on_create_todo", async () => {
        const { createDefaultRegistry } = await import("./definitions/index.js");
        const registry = createDefaultRegistry();
        expect(registry.getAutonomy("create_todo")).toBe("notify");
    });
});
//# sourceMappingURL=agent-tool-layer.test.js.map