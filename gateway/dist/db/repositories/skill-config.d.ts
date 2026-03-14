export interface SkillConfig {
    id: string;
    device_id: string;
    skill_name: string;
    enabled: boolean;
    config: any;
}
export declare function findByDevice(deviceId: string): Promise<SkillConfig[]>;
export declare function findByUser(userId: string): Promise<SkillConfig[]>;
export declare function upsert(fields: {
    device_id: string;
    user_id?: string;
    skill_name: string;
    enabled: boolean;
    config?: any;
}): Promise<void>;
export declare function upsertByUser(fields: {
    user_id: string;
    device_id: string;
    skill_name: string;
    enabled: boolean;
    config?: any;
}): Promise<void>;
