import { api } from "../api";

export async function pushSync(
  entries: any[],
): Promise<{ uploaded: number }> {
  return api.post("/api/v1/sync/push", { entries });
}

export async function pullSync(
  cursor?: string,
): Promise<{ records: any[]; cursor: string | null }> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api.get(`/api/v1/sync/pull${qs}`);
}
