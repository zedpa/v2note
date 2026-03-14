import { api } from "../api";

export interface UserProfile {
  device_id: string;
  content: string;
  updated_at?: string;
}

export async function getProfile(): Promise<UserProfile | null> {
  return api.get("/api/v1/profile");
}

export async function updateProfile(content: string): Promise<void> {
  await api.patch("/api/v1/profile", { content });
}
