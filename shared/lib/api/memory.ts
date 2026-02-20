import { api } from "../api";
import type { MemoryEntry } from "../types";

export async function listMemories(opts?: {
  limit?: number;
  start?: string;
  end?: string;
}): Promise<MemoryEntry[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.start) params.set("start", opts.start);
  if (opts?.end) params.set("end", opts.end);
  const qs = params.toString();
  return api.get(`/api/v1/memory${qs ? `?${qs}` : ""}`);
}

export async function deleteMemory(id: string): Promise<void> {
  await api.delete(`/api/v1/memory/${id}`);
}

export async function updateMemory(
  id: string,
  fields: { content?: string; importance?: number },
): Promise<void> {
  await api.patch(`/api/v1/memory/${id}`, fields);
}
