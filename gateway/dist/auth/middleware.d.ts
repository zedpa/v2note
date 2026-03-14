import type { IncomingMessage } from "node:http";
export interface AuthContext {
    userId: string;
    deviceId: string;
}
/**
 * Extract auth context from Authorization header.
 * Returns userId + deviceId from the JWT.
 */
export declare function getAuthContext(req: IncomingMessage): AuthContext;
/**
 * Try to extract auth context; returns null if no auth header present.
 * Useful for endpoints that support both authenticated and unauthenticated access.
 */
export declare function tryGetAuthContext(req: IncomingMessage): AuthContext | null;
