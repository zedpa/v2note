export interface UserProfile {
    id: string;
    device_id: string;
    content: string;
    name: string | null;
    pain_points: string | null;
    preferences: Record<string, any>;
    onboarding_done: boolean;
    updated_at: string;
}
export declare function findByDevice(deviceId: string): Promise<UserProfile | null>;
export declare function findByUser(userId: string): Promise<UserProfile | null>;
export declare function upsertByUser(userId: string, content: string): Promise<void>;
export declare function upsert(deviceId: string, content: string): Promise<void>;
/** 更新 onboarding 相关的单个字段 */
export declare function upsertOnboardingField(userId: string, field: "name" | "pain_points" | "onboarding_done", value: string): Promise<void>;
/** 更新 preferences JSON */
export declare function upsertPreferences(userId: string, prefs: Record<string, any>): Promise<void>;
