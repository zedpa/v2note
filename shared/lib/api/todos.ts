import { api } from "../api";
import type { TodoDTO } from "@/features/todos/lib/todo-types";

/** 获取所有待办（完整类型，不手动映射） */
export async function listTodos(): Promise<TodoDTO[]> {
  return api.get("/api/v1/todos");
}

/** 获取项目列表（level >= 1 的活跃目标/项目） */
export async function listProjects(): Promise<TodoDTO[]> {
  const data: any[] = await api.get("/api/v1/goals");
  return data.map((g) => ({
    ...g,
    text: g.title ?? g.text, // goals API 返回 title，统一为 text
  }));
}

/** 创建待办 */
export async function createTodo(fields: {
  text: string;
  record_id?: string;
  domain?: string;
  impact?: number;
  goal_id?: string;
  scheduled_start?: string;
  estimated_minutes?: number;
  priority?: number;
  parent_id?: string;
  level?: number;
  status?: string;
}): Promise<{ id: string }> {
  return api.post("/api/v1/todos", fields);
}

/** 更新待办 */
export async function updateTodo(
  id: string,
  fields: {
    text?: string;
    done?: boolean;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    estimated_minutes?: number | null;
    priority?: number;
    domain?: string;
    impact?: number;
    level?: number;
    status?: string;
    ai_actionable?: boolean;
    ai_action_plan?: string[];
    parent_id?: string | null;
  },
): Promise<void> {
  await api.patch(`/api/v1/todos/${id}`, fields);
}

/** 删除待办 */
export async function deleteTodo(id: string): Promise<void> {
  await api.delete(`/api/v1/todos/${id}`);
}
