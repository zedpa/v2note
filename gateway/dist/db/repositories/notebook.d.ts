export interface Notebook {
    id: string;
    device_id: string;
    name: string;
    description: string | null;
    color: string;
    is_system: boolean;
    created_at: string;
}
export declare function findByDevice(deviceId: string): Promise<Notebook[]>;
export declare function findByUser(userId: string): Promise<Notebook[]>;
export declare function findOrCreateByUser(userId: string, deviceId: string, name: string, description?: string, isSystem?: boolean, color?: string): Promise<Notebook>;
export declare function findById(id: string): Promise<Notebook | null>;
export declare function findOrCreate(deviceId: string, name: string, description?: string, isSystem?: boolean, color?: string): Promise<Notebook>;
export declare function update(id: string, fields: {
    name?: string;
    description?: string | null;
    color?: string;
}): Promise<Notebook | null>;
export declare function deleteById(id: string): Promise<boolean>;
/**
 * Ensure system notebooks exist for a device.
 */
export declare function ensureSystemNotebooks(deviceId: string): Promise<void>;
export declare function ensureSystemNotebooksByUser(userId: string, deviceId: string): Promise<void>;
