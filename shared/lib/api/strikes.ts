import { api } from "../api";

export interface StrikeView {
  id: string;
  nucleus: string;
  polarity: "perceive" | "judge" | "realize" | "intend" | "feel";
  confidence: number;
  tags: string[];
  created_at: string;
}

export async function fetchStrikesByRecord(
  recordId: string,
): Promise<StrikeView[]> {
  return api.get(`/api/v1/records/${recordId}/strikes`);
}

export async function updateStrike(
  id: string,
  data: { nucleus?: string; polarity?: string },
): Promise<void> {
  await api.patch(`/api/v1/strikes/${id}`, data);
}
