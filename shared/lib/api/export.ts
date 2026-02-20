import { api } from "../api";

export async function exportData(
  format: string,
): Promise<{ content: string; filename: string }> {
  return api.get(`/api/v1/export?format=${format}`);
}
