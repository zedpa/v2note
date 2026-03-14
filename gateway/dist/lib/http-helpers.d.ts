import type { IncomingMessage, ServerResponse } from "node:http";
/** Read the request body as parsed JSON */
export declare function readBody<T = any>(req: IncomingMessage): Promise<T>;
/** Send a JSON response */
export declare function sendJson(res: ServerResponse, data: any, status?: number): void;
/** Send an error response */
export declare function sendError(res: ServerResponse, message: string, status?: number): void;
/** Extract device ID — prefers JWT auth context, falls back to X-Device-Id header */
export declare function getDeviceId(req: IncomingMessage): string;
/**
 * Extract userId from JWT. Returns null if no valid JWT present.
 * Use this for data queries — userId represents the account, not a single device.
 */
export declare function getUserId(req: IncomingMessage): string | null;
export declare class HttpError extends Error {
    status: number;
    constructor(status: number, message: string);
}
