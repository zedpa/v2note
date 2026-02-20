import { api } from "../api";

export async function listIdeas(): Promise<any[]> {
  return api.get("/api/v1/ideas");
}

export async function createIdea(fields: {
  record_id: string;
  text: string;
}): Promise<{ id: string }> {
  return api.post("/api/v1/ideas", fields);
}

export async function deleteIdea(id: string): Promise<void> {
  await api.delete(`/api/v1/ideas/${id}`);
}
