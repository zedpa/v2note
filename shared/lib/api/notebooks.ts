import { api } from "../api";

export interface Notebook {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_system: boolean;
  created_at: string;
}

export interface DiaryEntry {
  id: string;
  notebook: string;
  entry_date: string;
  summary: string;
  full_content: string;
  created_at: string;
  updated_at: string;
}

export type DiarySummary = Pick<DiaryEntry, "id" | "entry_date" | "summary" | "notebook">;

export async function listNotebooks(): Promise<Notebook[]> {
  return api.get("/api/v1/notebooks");
}

export async function createNotebook(name: string, description?: string, color?: string): Promise<Notebook> {
  return api.post("/api/v1/notebooks", { name, description, color });
}

export async function updateNotebook(id: string, fields: { name?: string; description?: string; color?: string }): Promise<Notebook> {
  return api.patch(`/api/v1/notebooks/${id}`, fields);
}

export async function deleteNotebook(id: string): Promise<void> {
  await api.delete(`/api/v1/notebooks/${id}`);
}

export async function getDiaryEntry(notebook: string, date: string): Promise<DiaryEntry> {
  return api.get(`/api/v1/diary/${encodeURIComponent(notebook)}/${date}`);
}

export async function listDiarySummaries(
  notebook: string,
  start?: string,
  end?: string,
): Promise<DiarySummary[]> {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return api.get(`/api/v1/diary/${encodeURIComponent(notebook)}${qs ? `?${qs}` : ""}`);
}
