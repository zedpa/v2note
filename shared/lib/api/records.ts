import { api } from "../api";

export async function listRecords(opts?: {
  limit?: number;
  offset?: number;
  notebook?: string;
  /** @deprecated 使用 wiki_page_id 替代 */
  cluster_id?: string;
  wiki_page_id?: string;
}): Promise<any[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  if (opts?.notebook !== undefined) params.set("notebook", opts.notebook);
  if (opts?.wiki_page_id) params.set("wiki_page_id", opts.wiki_page_id);
  else if (opts?.cluster_id) params.set("cluster_id", opts.cluster_id);
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
  duration_seconds?: number;
  notebook?: string;
}): Promise<{ id: string }> {
  return api.post("/api/v1/records", fields);
}

export async function createManualNote(fields: {
  content: string;
  tags?: string[];
  useAi?: boolean;
  notebook?: string;
}): Promise<{ id: string }> {
  return api.post("/api/v1/records/manual", fields);
}

export async function updateRecord(
  id: string,
  fields: { status?: string; archived?: boolean; duration_seconds?: number; short_summary?: string },
): Promise<void> {
  await api.patch(`/api/v1/records/${id}`, fields);
}

export async function deleteRecords(ids: string[]): Promise<{ deleted: number }> {
  return api.delete("/api/v1/records", { ids });
}

export async function searchRecords(q: string): Promise<any[]> {
  return api.get(`/api/v1/records/search?q=${encodeURIComponent(q)}`);
}

/** 重试录音：上传 WAV 二进制到 gateway 转写+处理 */
export async function retryRecordAudio(
  recordId: string,
  wavData: ArrayBuffer,
): Promise<{ recordId: string; transcript: string }> {
  // 需要直接 fetch（非 JSON body）
  const { getGatewayHttpUrl } = await import("../gateway-url");
  const { getAccessToken } = await import("../auth");
  const { getApiDeviceId } = await import("../api");

  const base = getGatewayHttpUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
  };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const deviceId = getApiDeviceId();
  if (deviceId) headers["X-Device-Id"] = deviceId;

  const res = await fetch(`${base}/api/v1/records/${recordId}/retry-audio`, {
    method: "POST",
    headers,
    body: wavData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
