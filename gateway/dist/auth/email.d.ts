/**
 * 邮件发送服务（Resend）
 */
/** 发送验证码邮件 */
export declare function sendVerificationEmail(email: string, code: string): Promise<void>;
/** 生成 6 位随机数字验证码 */
export declare function generateCode(): string;
