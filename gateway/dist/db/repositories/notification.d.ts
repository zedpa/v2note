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
/** 查询未读数量（按设备） */
export declare function countUnread(deviceId: string): Promise<number>;
/** 查询未读数量（按用户，跨设备） */
export declare function countUnreadByUser(userId: string): Promise<number>;
/** 检查今天是否已发过指定类型的通知（按用户或设备去重） */
export declare function hasTodayNotification(type: string, userId?: string | null, deviceId?: string): Promise<boolean>;
/** 创建通知 */
export declare function create(input: CreateNotificationInput): Promise<Notification>;
/** 标记单条已读 */
export declare function markRead(id: string): Promise<void>;
/** 标记设备所有通知已读 */
export declare function markAllRead(deviceId: string): Promise<void>;
/** 标记用户所有通知已读（跨设备） */
export declare function markAllReadByUser(userId: string): Promise<void>;
