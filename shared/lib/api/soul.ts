import { api } from "../api";
import type { Soul } from "../types";

export async function getSoul(): Promise<Soul | null> {
  return api.get("/api/v1/soul");
}

export async function updateSoul(content: string): Promise<void> {
  await api.put("/api/v1/soul", { content });
}
