/**
 * Agent Plan 持久化
 */

import { queryOne, execute } from "../db/pool.js";

export interface PlanStep {
  index: number;
  description: string;
  tool_call?: { name: string; args: Record<string, unknown> };
  needs_confirm: boolean;
  status: "pending" | "running" | "done" | "failed" | "awaiting_confirm" | "skipped";
  result?: unknown;
  error?: string;
}

export interface AgentPlan {
  id: string;
  user_id: string;
  device_id: string;
  intent: string;
  steps: PlanStep[];
  status: string;
  current_step: number;
  rollback_info: unknown;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export async function createPlan(input: {
  userId: string;
  deviceId: string;
  intent: string;
  steps: Array<Omit<PlanStep, "index" | "status">>;
}): Promise<AgentPlan> {
  const steps: PlanStep[] = input.steps.map((s, i) => ({
    ...s,
    index: i,
    status: "pending" as const,
  }));

  const row = await queryOne<AgentPlan>(
    `INSERT INTO agent_plan (user_id, device_id, intent, steps, status)
     VALUES ($1, $2, $3, $4::jsonb, 'awaiting_confirm') RETURNING *`,
    [input.userId, input.deviceId, input.intent, JSON.stringify(steps)],
  );
  return row!;
}

export async function findActivePlan(userId: string): Promise<AgentPlan | null> {
  return queryOne<AgentPlan>(
    `SELECT * FROM agent_plan
     WHERE user_id = $1 AND status IN ('awaiting_confirm', 'executing', 'paused')
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
}

export async function findById(planId: string): Promise<AgentPlan | null> {
  return queryOne<AgentPlan>(
    `SELECT * FROM agent_plan WHERE id = $1`,
    [planId],
  );
}

export async function updatePlanStatus(planId: string, status: string): Promise<void> {
  await execute(
    `UPDATE agent_plan SET status = $1, updated_at = now() WHERE id = $2`,
    [status, planId],
  );
}

export async function updatePlanStep(
  planId: string,
  stepIndex: number,
  steps: PlanStep[],
  currentStep: number,
): Promise<void> {
  await execute(
    `UPDATE agent_plan SET steps = $1::jsonb, current_step = $2, updated_at = now() WHERE id = $3`,
    [JSON.stringify(steps), currentStep, planId],
  );
}

export async function updateRollbackInfo(
  planId: string,
  rollbackInfo: unknown,
): Promise<void> {
  await execute(
    `UPDATE agent_plan SET rollback_info = $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(rollbackInfo), planId],
  );
}

export async function expireOldPlans(): Promise<number> {
  const result = await execute(
    `UPDATE agent_plan SET status = 'expired', updated_at = now()
     WHERE status IN ('awaiting_confirm', 'paused') AND expires_at < now()`,
    [],
  );
  return 0; // execute doesn't return count, but that's ok
}
