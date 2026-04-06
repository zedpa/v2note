import { getItem, setItem } from "@/shared/lib/storage";
import { getDeviceId } from "@/shared/lib/device";
import { updateSettings } from "@/shared/lib/api/device";

const STORAGE_KEY = "tags:custom";

/** 每条记录最多允许的标签数 */
export const MAX_TAGS_PER_RECORD = 5;

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
  return [...customTags];
}

function syncToDb(tags: string[]) {
  getDeviceId()
    .then(() => {
      updateSettings({ custom_tags: tags }).catch(() => {});
    })
    .catch(() => {});
}
