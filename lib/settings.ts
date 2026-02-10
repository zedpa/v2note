import { Preferences } from "@capacitor/preferences";

const KEYS = {
  autoDeleteAudio: "settings:autoDeleteAudio",
} as const;

export async function getAutoDeleteAudio(): Promise<boolean> {
  const { value } = await Preferences.get({ key: KEYS.autoDeleteAudio });
  return value === "true";
}

export async function setAutoDeleteAudio(enabled: boolean): Promise<void> {
  await Preferences.set({ key: KEYS.autoDeleteAudio, value: String(enabled) });
}
