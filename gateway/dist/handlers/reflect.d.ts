/**
 * Generate a Socratic reflection question based on user's diary entry.
 * Returns null if the content doesn't warrant a follow-up.
 */
export declare function generateReflection(text: string, deviceId: string, userId?: string): Promise<string | null>;
/**
 * Generate a personalized AI status message based on soul.
 */
export declare function generateAiStatus(deviceId: string, userId?: string): Promise<string>;
