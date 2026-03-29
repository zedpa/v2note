export interface Device {
    id: string;
    device_identifier: string;
    platform: string;
    user_type: string | null;
    custom_tags: any;
    created_at: string;
}
export declare function findByIdentifier(identifier: string): Promise<Device | null>;
export declare function create(identifier: string, platform: string): Promise<Device>;
/** 原子性注册：如果 identifier 已存在则返回现有记录，isNew 标记是否新建 */
export declare function findOrCreate(identifier: string, platform: string): Promise<{
    device: Device;
    isNew: boolean;
}>;
export declare function update(id: string, fields: {
    user_type?: string;
    custom_tags?: any;
}): Promise<void>;
