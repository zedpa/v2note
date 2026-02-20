import { api } from "../api";

export async function registerDevice(
  identifier: string,
  platform: string,
): Promise<{ id: string }> {
  return api.post("/api/v1/devices/register", { identifier, platform });
}

export async function lookupDevice(
  identifier: string,
): Promise<{ id: string; user_type: string | null; custom_tags: any } | null> {
  try {
    return await api.get(`/api/v1/devices/lookup?identifier=${encodeURIComponent(identifier)}`);
  } catch {
    return null;
  }
}

export async function updateSettings(
  fields: { user_type?: string | null; custom_tags?: any },
): Promise<void> {
  await api.patch("/api/v1/devices/settings", fields);
}
