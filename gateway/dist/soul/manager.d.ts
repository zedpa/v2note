export interface Soul {
    device_id: string;
    content: string;
    updated_at: string;
}
/**
 * Load the Soul (user profile) for a device.
 */
export declare function loadSoul(deviceId: string): Promise<Soul | null>;
/**
 * Update the Soul based on new interactions.
 * The AI merges the existing soul with insights from the new interaction.
 */
export declare function updateSoul(deviceId: string, newInteraction: string): Promise<void>;
