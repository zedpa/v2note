export interface UserProfile {
    id: string;
    device_id: string;
    content: string;
    name: string | null;
    occupation: string | null;
    current_focus: string | null;
    pain_points: string | null;
    review_time: string | null;
    preferences: Record<string, any>;
    onboarding_done: boolean;
    updated_at: string;
}
export declare function findByDevice(deviceId: string): Promise<UserProfile | null>;
export declare function findByUser(userId: string): Promise<UserProfile | null>;
export declare function upsertByUser(userId: string, content: string, deviceId?: string): Promise<void>;
/** @deprecated 使用 upsertByUser 替代 */
export declare function upsert(deviceId: string, content: string): Promise<void>;
/** 更新 onboarding 相关的单个字段 */
export declare function upsertOnboardingField(userId: string, field: "name" | "occupation" | "current_focus" | "pain_points" | "review_time" | "onboarding_done", value: string, deviceId?: string): Promise<void>;
/** 更新 preferences JSON */
export declare function upsertPreferences(userId: string, prefs: Record<string, any>): Promise<void>;
