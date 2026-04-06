import { api } from "../api";

export interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: any[];
  created_at: string;
}

export interface ChatHistoryResponse {
  messages: ChatHistoryMessage[];
  has_more: boolean;
}

/** 分页加载聊天历史 */
export async function fetchChatHistory(opts?: {
  limit?: number;
  before?: string;
}): Promise<ChatHistoryResponse> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.before) params.set("before", opts.before);
  const qs = params.toString();
  return api.get(`/api/v1/chat/history${qs ? `?${qs}` : ""}`);
}

/** 清空聊天历史 */
export async function clearChatHistory(): Promise<void> {
  await api.delete("/api/v1/chat/history");
}
