import { Device as CapDevice } from '@capacitor/device'
import { supabase } from './supabase'

let cachedDeviceId: string | null = null

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId

  const info = await CapDevice.getId()
  const identifier = info.identifier

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
  const deviceInfo = await CapDevice.getInfo()
  const { data: created, error } = await supabase
    .from('device')
    .insert({
      device_identifier: identifier,
      platform: deviceInfo.platform,
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
