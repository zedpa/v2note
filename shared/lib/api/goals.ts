import { api } from "../api";
import type { Goal, PendingIntent } from "../types";

export async function listGoals(): Promise<Goal[]> {
  return api.get("/api/v1/goals");
}

export async function createGoal(fields: {
  title: string;
  parent_id?: string;
  source?: string;
}): Promise<Goal> {
  return api.post("/api/v1/goals", fields);
}

export async function updateGoal(
  id: string,
  fields: { title?: string; status?: string; parent_id?: string | null },
): Promise<void> {
  await api.patch(`/api/v1/goals/${id}`, fields);
}

export async function listGoalTodos(goalId: string) {
  return api.get<Array<{ id: string; text: string; done: boolean }>>(`/api/v1/goals/${goalId}/todos`);
}

export async function listPendingIntents(): Promise<PendingIntent[]> {
  return api.get("/api/v1/intents/pending");
}
