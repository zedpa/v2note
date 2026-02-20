/**
 * Cross-platform key-value storage.
 * Uses Capacitor Preferences on native, falls back to localStorage on web.
 */

let _useNative: boolean | null = null;

async function useNative(): Promise<boolean> {
  if (_useNative !== null) return _useNative;
  try {
    const { Capacitor } = await import("@capacitor/core");
    _useNative = Capacitor.isNativePlatform();
  } catch {
    _useNative = false;
  }
  return _useNative;
}

export async function getItem(key: string): Promise<string | null> {
  if (await useNative()) {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (await useNative()) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (await useNative()) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
}
