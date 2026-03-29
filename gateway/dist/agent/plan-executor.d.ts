/**
 * Plan Executor — 逐步执行 Plan
 *
 * 支持自动执行 (silent/notify) 和暂停等确认 (confirm/needs_confirm)
 */
import type { PlanStep } from "./plan-repo.js";
export type ToolExecutor = (toolName: string, args: Record<string, unknown>) => Promise<{
    success: boolean;
    message: string;
    data?: unknown;
}>;
interface StepResult {
    status: "done" | "failed" | "awaiting_confirm";
    result?: unknown;
    error?: string;
}
/**
 * 执行单个 Plan step
 * - needs_confirm=true → 暂停返回 awaiting_confirm
 * - needs_confirm=false + tool_call → 自动执行
 * - 无 tool_call → 纯推理步骤，直接标记 done
 */
export declare function executePlanStep(step: PlanStep, executor: ToolExecutor): Promise<StepResult>;
/**
 * 执行 Plan 中从 startStep 开始的所有步骤
 * 遇到 confirm 或 failure 时暂停
 */
export declare function executePlan(steps: PlanStep[], startStep: number, executor: ToolExecutor): Promise<{
    completedUntil: number;
    pauseReason?: "confirm" | "failure";
    steps: PlanStep[];
}>;
/** Plan 步骤数不超过 20 */
export declare function validatePlanSteps(steps: unknown[]): boolean;
export {};
