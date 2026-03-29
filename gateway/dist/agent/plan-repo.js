/**
 * Agent Plan 持久化
 */
import { queryOne, execute } from "../db/pool.js";
export async function createPlan(input) {
    const steps = input.steps.map((s, i) => ({
        ...s,
        index: i,
        status: "pending",
    }));
    const row = await queryOne(`INSERT INTO agent_plan (user_id, device_id, intent, steps, status)
     VALUES ($1, $2, $3, $4::jsonb, 'awaiting_confirm') RETURNING *`, [input.userId, input.deviceId, input.intent, JSON.stringify(steps)]);
    return row;
}
export async function findActivePlan(userId) {
    return queryOne(`SELECT * FROM agent_plan
     WHERE user_id = $1 AND status IN ('awaiting_confirm', 'executing', 'paused')
     ORDER BY created_at DESC LIMIT 1`, [userId]);
}
export async function findById(planId) {
    return queryOne(`SELECT * FROM agent_plan WHERE id = $1`, [planId]);
}
export async function updatePlanStatus(planId, status) {
    await execute(`UPDATE agent_plan SET status = $1, updated_at = now() WHERE id = $2`, [status, planId]);
}
export async function updatePlanStep(planId, stepIndex, steps, currentStep) {
    await execute(`UPDATE agent_plan SET steps = $1::jsonb, current_step = $2, updated_at = now() WHERE id = $3`, [JSON.stringify(steps), currentStep, planId]);
}
export async function updateRollbackInfo(planId, rollbackInfo) {
    await execute(`UPDATE agent_plan SET rollback_info = $1::jsonb, updated_at = now() WHERE id = $2`, [JSON.stringify(rollbackInfo), planId]);
}
export async function expireOldPlans() {
    const result = await execute(`UPDATE agent_plan SET status = 'expired', updated_at = now()
     WHERE status IN ('awaiting_confirm', 'paused') AND expires_at < now()`, []);
    return 0; // execute doesn't return count, but that's ok
}
//# sourceMappingURL=plan-repo.js.map