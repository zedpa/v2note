import { api } from "../api";

export async function listTags(): Promise<any[]> {
  return api.get("/api/v1/tags");
}

export async function addTagToRecord(
  recordId: string,
  name: string,
): Promise<void> {
  await api.post(`/api/v1/records/${recordId}/tags`, { name });
}

export async function removeTagFromRecord(
  recordId: string,
  tagId: string,
): Promise<void> {
  await api.delete(`/api/v1/records/${recordId}/tags/${tagId}`);
}
