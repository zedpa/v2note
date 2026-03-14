export interface Soul {
    device_id: string;
    content: string;
    updated_at: string;
}
/**
 * Load the Soul (AI identity definition) for a device.
 */
export declare function loadSoul(deviceId: string): Promise<Soul | null>;
/**
 * Update the Soul (AI identity definition) based on new interactions.
 * Serialized per-user to prevent concurrent overwrites.
 */
export declare function updateSoul(deviceId: string, newInteraction: string, userId?: string): Promise<void>;
