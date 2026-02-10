import { getItem, setItem } from "./storage";

const KEYS = {
  autoDeleteAudio: "settings:autoDeleteAudio",
} as const;

export async function getAutoDeleteAudio(): Promise<boolean> {
  const value = await getItem(KEYS.autoDeleteAudio);
  return value === "true";
}

export async function setAutoDeleteAudio(enabled: boolean): Promise<void> {
  await setItem(KEYS.autoDeleteAudio, String(enabled));
}
