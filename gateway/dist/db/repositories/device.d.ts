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
export declare function update(id: string, fields: {
    user_type?: string;
    custom_tags?: any;
}): Promise<void>;
