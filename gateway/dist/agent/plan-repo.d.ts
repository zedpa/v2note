/**
 * Agent Plan 持久化
 */
export interface PlanStep {
    index: number;
    description: string;
    tool_call?: {
        name: string;
        args: Record<string, unknown>;
    };
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
export declare function createPlan(input: {
    userId: string;
    deviceId: string;
    intent: string;
    steps: Array<Omit<PlanStep, "index" | "status">>;
}): Promise<AgentPlan>;
export declare function findActivePlan(userId: string): Promise<AgentPlan | null>;
export declare function findById(planId: string): Promise<AgentPlan | null>;
export declare function updatePlanStatus(planId: string, status: string): Promise<void>;
export declare function updatePlanStep(planId: string, stepIndex: number, steps: PlanStep[], currentStep: number): Promise<void>;
export declare function updateRollbackInfo(planId: string, rollbackInfo: unknown): Promise<void>;
export declare function expireOldPlans(): Promise<number>;
