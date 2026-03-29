/**
 * notification CRUD — 通知持久化
 */
export interface Notification {
    id: string;
    device_id: string;
    user_id: string | null;
    type: string;
    title: string | null;
    body: string | null;
    read: boolean;
    created_at: string;
}
export interface CreateNotificationInput {
    deviceId: string;
    userId?: string | null;
    type: string;
    title?: string | null;
    body?: string | null;
}
/** 按设备查询最近通知 */
export declare function findByDevice(deviceId: string, limit?: number): Promise<Notification[]>;
/** 按用户查询最近通知 */
export declare function findByUser(userId: string, limit?: number): Promise<Notification[]>;
/** 查询未读数量 */
export declare function countUnread(deviceId: string): Promise<number>;
/** 创建通知 */
export declare function create(input: CreateNotificationInput): Promise<Notification>;
/** 标记单条已读 */
export declare function markRead(id: string): Promise<void>;
/** 标记设备所有通知已读 */
export declare function markAllRead(deviceId: string): Promise<void>;
