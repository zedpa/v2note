import { getItem, setItem } from "./storage";
import { supabase } from "./supabase";
import { getDeviceId } from "./device";

const STORAGE_KEY = "tags:custom";

export const SYSTEM_TAGS = ["待办", "灵感", "复盘"] as const;

export async function getCustomTags(): Promise<string[]> {
  const raw = await getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setCustomTags(tags: string[]): Promise<void> {
  await setItem(STORAGE_KEY, JSON.stringify(tags));
  // Sync to DB (fire-and-forget)
  syncToDb(tags);
}

export async function addCustomTag(name: string): Promise<void> {
  const tags = await getCustomTags();
  if (tags.includes(name)) return;
  const updated = [...tags, name];
  await setCustomTags(updated);
}

export async function removeCustomTag(name: string): Promise<void> {
  const tags = await getCustomTags();
  const updated = tags.filter((t) => t !== name);
  await setCustomTags(updated);
}

export function getAvailableTags(customTags: string[]): string[] {
  return [...SYSTEM_TAGS, ...customTags];
}

function syncToDb(tags: string[]) {
  getDeviceId()
    .then((deviceId) => {
      supabase.from("device").update({ custom_tags: tags }).eq("id", deviceId).then(() => {});
    })
    .catch(() => {});
}
