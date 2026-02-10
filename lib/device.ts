import { supabase } from './supabase'

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
  const { data: existing } = await supabase
    .from('device')
    .select('id')
    .eq('device_identifier', identifier)
    .single()

  if (existing) {
    cachedDeviceId = existing.id
    return existing.id
  }

  // Register new device
  const { data: created, error } = await supabase
    .from('device')
    .insert({
      device_identifier: identifier,
      platform,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`Failed to register device: ${error?.message}`)
  }

  cachedDeviceId = created.id
  return created.id
}

export function clearDeviceCache() {
  cachedDeviceId = null
}
