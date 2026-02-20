import { getItem, setItem } from "./storage";
import { getDeviceId } from "./device";
import { updateSettings } from "./api/device";
import type { UserType } from "./types";

const KEYS = {
  autoDeleteAudio: "settings:autoDeleteAudio",
  userType: "settings:userType",
} as const;

export async function getAutoDeleteAudio(): Promise<boolean> {
  const value = await getItem(KEYS.autoDeleteAudio);
  return value === "true";
}

export async function setAutoDeleteAudio(enabled: boolean): Promise<void> {
  await setItem(KEYS.autoDeleteAudio, String(enabled));
}

export async function getUserType(): Promise<UserType> {
  const value = await getItem(KEYS.userType);
  if (value === "manager" || value === "creator") return value;
  return null;
}

export async function setUserType(userType: UserType): Promise<void> {
  if (userType) {
    await setItem(KEYS.userType, userType);
  } else {
    const { removeItem } = await import("./storage");
    await removeItem(KEYS.userType);
  }

  // Sync to device settings (fire-and-forget)
  try {
    await getDeviceId();
    await updateSettings({ user_type: userType });
  } catch {
    // Non-critical: local storage is the source of truth for quick reads
  }
}
