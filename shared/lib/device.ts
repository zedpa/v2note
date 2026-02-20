import { registerDevice, lookupDevice } from "./api/device";
import { setApiDeviceId } from "./api";

let cachedDeviceId: string | null = null

async function getDeviceIdentifier(): Promise<{ identifier: string; platform: string }> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const { Device } = await import('@capacitor/device')
      const idResult = await Device.getId()
      const info = await Device.getInfo()
      return { identifier: idResult.identifier, platform: info.platform }
    }
  } catch {
    // Capacitor not available
  }

  // Web fallback: generate and persist a random device ID
  const STORAGE_KEY = 'voicenote:deviceIdentifier'
  let identifier = localStorage.getItem(STORAGE_KEY)
  if (!identifier) {
    identifier = `web-${crypto.randomUUID()}`
    localStorage.setItem(STORAGE_KEY, identifier)
  }
  return { identifier, platform: 'web' }
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId

  const { identifier, platform } = await getDeviceIdentifier()

  // Try to find existing device
  const existing = await lookupDevice(identifier);
  if (existing) {
    cachedDeviceId = existing.id;
    setApiDeviceId(existing.id);
    return existing.id;
  }

  // Register new device
  const created = await registerDevice(identifier, platform);
  cachedDeviceId = created.id;
  setApiDeviceId(created.id);
  return created.id;
}

export function clearDeviceCache() {
  cachedDeviceId = null
}
