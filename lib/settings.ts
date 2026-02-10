import { getItem, setItem } from "./storage";
import { supabase } from "./supabase";
import { getDeviceId } from "./device";
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

  // Sync to Supabase device table (fire-and-forget)
  try {
    const deviceId = await getDeviceId();
    await supabase
      .from("device")
      .update({ user_type: userType })
      .eq("id", deviceId);
  } catch {
    // Non-critical: local storage is the source of truth for quick reads
  }
}
