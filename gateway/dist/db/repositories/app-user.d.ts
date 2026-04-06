export interface AppUser {
    id: string;
    phone: string | null;
    email: string | null;
    password_hash: string;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
}
export declare function findById(id: string): Promise<AppUser | null>;
export declare function findByPhone(phone: string): Promise<AppUser | null>;
export declare function findByEmail(email: string): Promise<AppUser | null>;
export declare function create(fields: {
    phone: string;
    password_hash: string;
    display_name?: string;
}): Promise<AppUser>;
/** 邮箱注册创建用户（phone 为 NULL） */
export declare function createWithEmail(fields: {
    email: string;
    password_hash: string;
    display_name?: string;
}): Promise<AppUser>;
/** 更新密码 */
export declare function updatePassword(userId: string, passwordHash: string): Promise<void>;
/** 绑定/更新邮箱 */
export declare function updateEmail(userId: string, email: string): Promise<AppUser>;
/** 更新个人资料（昵称、头像） */
export declare function updateProfile(userId: string, fields: {
    display_name?: string;
    avatar_url?: string;
}): Promise<AppUser>;
