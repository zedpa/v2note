/**
 * Plan Executor — 逐步执行 Plan
 *
 * 支持自动执行 (silent/notify) 和暂停等确认 (confirm/needs_confirm)
 */
/**
 * 执行单个 Plan step
 * - needs_confirm=true → 暂停返回 awaiting_confirm
 * - needs_confirm=false + tool_call → 自动执行
 * - 无 tool_call → 纯推理步骤，直接标记 done
 */
export async function executePlanStep(step, executor) {
    // 需要确认的步骤：暂停
    if (step.needs_confirm) {
        return { status: "awaiting_confirm" };
    }
    // 无工具调用：纯推理步骤
    if (!step.tool_call) {
        return { status: "done" };
    }
    // 自动执行工具
    try {
        const result = await executor(step.tool_call.name, step.tool_call.args);
        return {
            status: result.success ? "done" : "failed",
            result,
            error: result.success ? undefined : result.message,
        };
    }
    catch (err) {
        return {
            status: "failed",
            error: err.message ?? String(err),
        };
    }
}
/**
 * 执行 Plan 中从 startStep 开始的所有步骤
 * 遇到 confirm 或 failure 时暂停
 */
export async function executePlan(steps, startStep, executor) {
    const updatedSteps = [...steps];
    for (let i = startStep; i < updatedSteps.length; i++) {
        const step = updatedSteps[i];
        if (step.status === "done" || step.status === "skipped")
            continue;
        step.status = "running";
        const result = await executePlanStep(step, executor);
        step.status = result.status;
        step.result = result.result;
        step.error = result.error;
        if (result.status === "awaiting_confirm") {
            return { completedUntil: i, pauseReason: "confirm", steps: updatedSteps };
        }
        if (result.status === "failed") {
            return { completedUntil: i, pauseReason: "failure", steps: updatedSteps };
        }
    }
    return { completedUntil: updatedSteps.length, steps: updatedSteps };
}
/** Plan 步骤数不超过 20 */
export function validatePlanSteps(steps) {
    return steps.length <= 20;
}
//# sourceMappingURL=plan-executor.js.map