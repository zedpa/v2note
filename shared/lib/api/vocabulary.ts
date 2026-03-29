import { api } from "../api";

export interface VocabItem {
  id: string;
  term: string;
  aliases: string[];
  domain: string;
  frequency: number;
  source: "preset" | "user" | "auto";
}

/** 获取用户词库列表 */
export async function fetchVocabulary(): Promise<VocabItem[]> {
  return api.get<VocabItem[]>("/api/v1/vocabulary");
}

/** 添加自定义词汇 */
export async function addVocabulary(params: {
  term: string;
  domain: string;
  aliases?: string[];
}): Promise<VocabItem> {
  return api.post<VocabItem>("/api/v1/vocabulary", params);
}

/** 删除词汇 */
export async function deleteVocabulary(id: string): Promise<void> {
  await api.delete(`/api/v1/vocabulary/${id}`);
}

/** 导入预设领域词库 */
export async function importDomain(
  domain: string,
): Promise<{ count: number }> {
  return api.post<{ count: number }>("/api/v1/vocabulary/import", { domain });
}
