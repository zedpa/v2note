export interface UserProfile {
    device_id: string;
    content: string;
    updated_at: string;
}
/**
 * Load the user profile for a device.
 */
export declare function loadProfile(deviceId: string, userId?: string): Promise<UserProfile | null>;
/**
 * Update the user profile based on new interactions.
 * Serialized per-user to prevent concurrent overwrites.
 */
export declare function updateProfile(deviceId: string, newInteraction: string, userId?: string): Promise<void>;
