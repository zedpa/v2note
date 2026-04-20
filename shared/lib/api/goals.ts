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
  fields: { title?: string; status?: string; parent_id?: string | null; done?: boolean },
): Promise<void> {
  await api.patch(`/api/v1/goals/${id}`, fields);
}

export async function listGoalTodos(goalId: string) {
  return api.get<Array<{ id: string; text: string; done: boolean }>>(`/api/v1/goals/${goalId}/todos`);
}

export async function getGoalHealth(goalId: string) {
  return api.get<{
    direction: number;
    resource: number;
    path: number;
    drive: number;
  }>(`/api/v1/goals/${goalId}/health`);
}

export async function getGoalTimeline(goalId: string) {
  return api.get<Array<{
    id: string;
    type: string;
    text: string;
    date: string;
  }>>(`/api/v1/goals/${goalId}/timeline`);
}

export async function confirmGoal(goalId: string): Promise<void> {
  await api.post(`/api/v1/goals/${goalId}/confirm`, {});
}

export async function archiveGoal(goalId: string): Promise<void> {
  await api.post(`/api/v1/goals/${goalId}/archive`, {});
}

export async function triggerAutoLink(goalId: string) {
  return api.post<{ clusterLinked: boolean; recordsFound: number; todosLinked: number }>(
    `/api/v1/goals/${goalId}/auto-link`,
    {},
  );
}

export async function getProjectProgress(goalId: string) {
  return api.get<{
    children: Array<{
      id: string;
      title: string;
      status: string;
      totalTodos: number;
      completedTodos: number;
      completionPercent: number;
    }>;
    totalTodos: number;
    completedTodos: number;
    overallPercent: number;
  }>(`/api/v1/goals/${goalId}/progress`);
}

export async function listPendingIntents(): Promise<PendingIntent[]> {
  return api.get("/api/v1/intents/pending");
}

/** L3 维度统计（侧边栏"我的世界"）
 * @deprecated 使用 getMyWorld 替代
 */
export interface DimensionSummary {
  domain: string;
  pending_count: number;
  goal_count: number;
}

export async function listDimensions(): Promise<DimensionSummary[]> {
  return api.get("/api/v1/dimensions");
}

// ── My World 树结构 ──────────────────────────────────────────

export interface MyWorldNode {
  id: string;
  type: "l2_cluster" | "l1_cluster" | "goal" | "action";
  title: string;
  memberCount?: number;
  subtaskTotal?: number;
  subtaskDone?: number;
  status?: string;
  done?: boolean;
  children: MyWorldNode[];
}

export async function getMyWorld(): Promise<{ nodes: MyWorldNode[] }> {
  return api.get("/api/v1/sidebar/my-world");
}

// ── 聚类管理 ──────────────────────────────────────────────────

export async function updateCluster(id: string, fields: { name: string }): Promise<void> {
  await api.patch(`/api/v1/cognitive/clusters/${id}`, fields);
}

export async function dissolveCluster(id: string): Promise<void> {
  await api.delete(`/api/v1/cognitive/clusters/${id}`);
}
