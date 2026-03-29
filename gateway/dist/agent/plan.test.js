/**
 * agent-plan spec 测试
 * Plan CRUD + executor + 状态流转
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
// =====================================================================
// Plan CRUD
// =====================================================================
describe("Plan CRUD", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    it("should_create_plan_with_correct_structure", async () => {
        const { createPlan } = await import("./plan-repo.js");
        mockQueryOne.mockResolvedValueOnce({
            id: "plan-1",
            user_id: "user-1",
            device_id: "dev-1",
            intent: "拆解Q2产品发布",
            steps: [],
            status: "awaiting_confirm",
            current_step: 0,
        });
        const plan = await createPlan({
            userId: "user-1",
            deviceId: "dev-1",
            intent: "拆解Q2产品发布",
            steps: [
                { description: "搜索目标", tool_call: { name: "search", args: {} }, needs_confirm: false },
                { description: "创建子目标", tool_call: { name: "create_goal", args: {} }, needs_confirm: true },
            ],
        });
        expect(plan).toBeDefined();
        expect(plan.id).toBe("plan-1");
        expect(plan.status).toBe("awaiting_confirm");
    });
    it("should_update_plan_status", async () => {
        const { updatePlanStatus } = await import("./plan-repo.js");
        await updatePlanStatus("plan-1", "executing");
        expect(mockExecute).toHaveBeenCalled();
        const sql = mockExecute.mock.calls[0][0];
        expect(sql).toContain("status");
        expect(sql).toContain("agent_plan");
    });
    it("should_find_active_plan_for_user", async () => {
        const { findActivePlan } = await import("./plan-repo.js");
        mockQueryOne.mockResolvedValueOnce({
            id: "plan-2",
            status: "awaiting_confirm",
            intent: "test",
        });
        const plan = await findActivePlan("user-1");
        expect(plan).toBeDefined();
        expect(plan.id).toBe("plan-2");
    });
});
// =====================================================================
// Plan Executor
// =====================================================================
describe("Plan Executor", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    it("should_execute_silent_steps_automatically", async () => {
        const { executePlanStep } = await import("./plan-executor.js");
        const step = {
            index: 0,
            description: "搜索目标",
            tool_call: { name: "search", args: { query: "Q2", scope: "goals" } },
            needs_confirm: false,
            status: "pending",
        };
        const mockToolExecutor = vi.fn().mockResolvedValue({
            success: true,
            message: "找到 1 个结果",
            data: { results: [] },
        });
        const result = await executePlanStep(step, mockToolExecutor);
        expect(result.status).toBe("done");
        expect(result.result).toBeDefined();
        expect(mockToolExecutor).toHaveBeenCalledWith("search", step.tool_call.args);
    });
    it("should_pause_on_confirm_steps", async () => {
        const { executePlanStep } = await import("./plan-executor.js");
        const step = {
            index: 1,
            description: "创建子目标",
            tool_call: { name: "create_goal", args: {} },
            needs_confirm: true,
            status: "pending",
        };
        const mockToolExecutor = vi.fn();
        const result = await executePlanStep(step, mockToolExecutor);
        expect(result.status).toBe("awaiting_confirm");
        expect(mockToolExecutor).not.toHaveBeenCalled();
    });
    it("should_handle_tool_execution_failure", async () => {
        const { executePlanStep } = await import("./plan-executor.js");
        const step = {
            index: 0,
            description: "搜索",
            tool_call: { name: "search", args: {} },
            needs_confirm: false,
            status: "pending",
        };
        const mockToolExecutor = vi.fn().mockRejectedValue(new Error("DB error"));
        const result = await executePlanStep(step, mockToolExecutor);
        expect(result.status).toBe("failed");
        expect(result.error).toContain("DB error");
    });
});
// =====================================================================
// Plan 状态流转
// =====================================================================
describe("Plan 状态流转", () => {
    it("should_not_exceed_20_steps", async () => {
        const { validatePlanSteps } = await import("./plan-executor.js");
        const steps = Array.from({ length: 21 }, (_, i) => ({
            index: i,
            description: `Step ${i}`,
            needs_confirm: false,
            status: "pending",
        }));
        const valid = validatePlanSteps(steps);
        expect(valid).toBe(false);
    });
    it("should_accept_plan_with_20_or_fewer_steps", async () => {
        const { validatePlanSteps } = await import("./plan-executor.js");
        const steps = Array.from({ length: 20 }, (_, i) => ({
            index: i,
            description: `Step ${i}`,
            needs_confirm: false,
            status: "pending",
        }));
        const valid = validatePlanSteps(steps);
        expect(valid).toBe(true);
    });
});
//# sourceMappingURL=plan.test.js.map