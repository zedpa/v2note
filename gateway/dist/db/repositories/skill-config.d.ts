export interface SkillConfig {
    id: string;
    device_id: string;
    skill_name: string;
    enabled: boolean;
    config: any;
}
export declare function findByDevice(deviceId: string): Promise<SkillConfig[]>;
export declare function upsert(fields: {
    device_id: string;
    skill_name: string;
    enabled: boolean;
    config?: any;
}): Promise<void>;
