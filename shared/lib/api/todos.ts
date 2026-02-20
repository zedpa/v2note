import { api } from "../api";

export async function listTodos(): Promise<any[]> {
  return api.get("/api/v1/todos");
}

export async function createTodo(fields: {
  record_id: string;
  text: string;
}): Promise<{ id: string }> {
  return api.post("/api/v1/todos", fields);
}

export async function updateTodo(
  id: string,
  fields: { text?: string; done?: boolean },
): Promise<void> {
  await api.patch(`/api/v1/todos/${id}`, fields);
}

export async function deleteTodo(id: string): Promise<void> {
  await api.delete(`/api/v1/todos/${id}`);
}
