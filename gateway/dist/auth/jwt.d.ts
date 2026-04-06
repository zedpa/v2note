export interface AccessTokenPayload {
    userId: string;
    deviceId: string;
}
export interface RefreshTokenPayload {
    userId: string;
    tokenId: string;
}
export declare function signAccessToken(payload: AccessTokenPayload): string;
export declare function signRefreshToken(payload: RefreshTokenPayload): string;
export declare function verifyAccessToken(token: string): AccessTokenPayload;
export declare function verifyRefreshToken(token: string): RefreshTokenPayload;
export interface EmailVerificationPayload {
    email: string;
    purpose: "register" | "bind" | "reset_password";
}
/** 签发邮箱验证 token（验证码通过后，用于后续操作，10 分钟有效） */
export declare function signEmailVerificationToken(payload: EmailVerificationPayload): string;
/** 验证邮箱验证 token */
export declare function verifyEmailVerificationToken(token: string): EmailVerificationPayload;
