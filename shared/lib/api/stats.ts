import { api } from "../api";

export async function getWeekStats(): Promise<{
  recordCount: number;
  todoTotal: number;
  todoDone: number;
}> {
  return api.get("/api/v1/stats/week");
}

export async function getUsageStats(): Promise<{
  monthlyCount: number;
  limit: number;
}> {
  return api.get("/api/v1/stats/usage");
}

export async function getDailyTrend(): Promise<
  Array<{ date: string; count: number }>
> {
  return api.get("/api/v1/stats/daily-trend");
}

export async function getTagDistribution(): Promise<
  Array<{ name: string; count: number }>
> {
  return api.get("/api/v1/stats/tag-distribution");
}

export async function getTodoTrend(): Promise<
  Array<{ date: string; created: number; completed: number }>
> {
  return api.get("/api/v1/stats/todo-trend");
}
