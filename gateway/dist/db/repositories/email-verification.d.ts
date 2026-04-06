export interface EmailVerification {
    id: string;
    email: string;
    code: string;
    purpose: "register" | "bind" | "reset_password";
    expires_at: string;
    attempts: number;
    used: boolean;
    created_at: string;
}
/** 创建验证码记录 */
export declare function create(fields: {
    email: string;
    code: string;
    purpose: string;
    expires_at: Date;
}): Promise<EmailVerification>;
/** 查找该邮箱 + purpose 最近的未使用、未过期验证码 */
export declare function findLatestUnused(email: string, purpose: string): Promise<EmailVerification | null>;
/** 查找该邮箱最近 60 秒内的验证码（防重复发送） */
export declare function findRecentByEmail(email: string): Promise<EmailVerification | null>;
/** 增加尝试次数 */
export declare function incrementAttempts(id: string): Promise<void>;
/** 标记为已使用 */
export declare function markUsed(id: string): Promise<void>;
