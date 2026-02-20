import { api } from "../api";

export async function listRecords(opts?: {
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return api.get(`/api/v1/records${qs ? `?${qs}` : ""}`);
}

export async function getRecord(id: string): Promise<any> {
  return api.get(`/api/v1/records/${id}`);
}

export async function createRecord(fields: {
  status?: string;
  source?: string;
  location_text?: string;
}): Promise<{ id: string }> {
  return api.post("/api/v1/records", fields);
}

export async function createManualNote(fields: {
  content: string;
  tags?: string[];
  useAi?: boolean;
}): Promise<{ id: string }> {
  return api.post("/api/v1/records/manual", fields);
}

export async function updateRecord(
  id: string,
  fields: { status?: string; archived?: boolean; duration_seconds?: number },
): Promise<void> {
  await api.patch(`/api/v1/records/${id}`, fields);
}

export async function deleteRecords(ids: string[]): Promise<{ deleted: number }> {
  return api.delete("/api/v1/records", { ids });
}

export async function searchRecords(q: string): Promise<any[]> {
  return api.get(`/api/v1/records/search?q=${encodeURIComponent(q)}`);
}
