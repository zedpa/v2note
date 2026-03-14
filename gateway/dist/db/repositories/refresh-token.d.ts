export interface RefreshToken {
    id: string;
    user_id: string;
    token_hash: string;
    device_id: string | null;
    expires_at: string;
    created_at: string;
}
/** Hash a raw token for storage */
export declare function hashToken(token: string): string;
export declare function create(fields: {
    user_id: string;
    token_hash: string;
    device_id?: string;
    expires_at: Date;
}): Promise<RefreshToken>;
export declare function findByHash(tokenHash: string): Promise<RefreshToken | null>;
export declare function deleteByHash(tokenHash: string): Promise<void>;
export declare function deleteByUser(userId: string): Promise<void>;
