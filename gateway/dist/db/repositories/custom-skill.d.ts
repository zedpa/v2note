export interface CustomSkill {
    id: string;
    device_id: string;
    name: string;
    description: string;
    prompt: string;
    type: "review" | "process";
    enabled: boolean;
    created_by: "user" | "ai";
    created_at: string;
    updated_at: string;
}
export declare function findByDevice(deviceId: string): Promise<CustomSkill[]>;
export declare function findByDeviceAndName(deviceId: string, name: string): Promise<CustomSkill | null>;
export declare function create(fields: {
    device_id: string;
    name: string;
    description?: string;
    prompt: string;
    type?: "review" | "process";
    created_by?: "user" | "ai";
}): Promise<CustomSkill>;
export declare function update(id: string, fields: {
    name?: string;
    description?: string;
    prompt?: string;
    type?: "review" | "process";
    enabled?: boolean;
}): Promise<void>;
export declare function deleteById(id: string): Promise<number>;
export declare function deleteByName(deviceId: string, name: string): Promise<number>;
