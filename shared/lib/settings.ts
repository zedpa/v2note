import { getDeviceId } from "./device";
import { updateSettings as syncToServer } from "./api/device";
import { getSettings, updateSettings as updateLocalSettings } from "./local-config";
import type { UserType } from "./types";

export async function getAutoDeleteAudio(): Promise<boolean> {
  const settings = await getSettings();
  return settings.autoDeleteAudio ?? false;
}

export async function setAutoDeleteAudio(enabled: boolean): Promise<void> {
  await updateLocalSettings({ autoDeleteAudio: enabled });
}

export async function getUserType(): Promise<UserType> {
  const settings = await getSettings();
  return settings.userType ?? null;
}

export async function setUserType(userType: UserType): Promise<void> {
  await updateLocalSettings({ userType });

  // Sync to device settings (fire-and-forget)
  try {
    await getDeviceId();
    await syncToServer({ user_type: userType });
  } catch {
    // Non-critical: local storage is the source of truth for quick reads
  }
}
