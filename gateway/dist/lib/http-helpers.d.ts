import type { IncomingMessage, ServerResponse } from "node:http";
/** Read the request body as parsed JSON */
export declare function readBody<T = any>(req: IncomingMessage): Promise<T>;
/** Send a JSON response */
export declare function sendJson(res: ServerResponse, data: any, status?: number): void;
/** Send an error response */
export declare function sendError(res: ServerResponse, message: string, status?: number): void;
/** Extract X-Device-Id header */
export declare function getDeviceId(req: IncomingMessage): string;
export declare class HttpError extends Error {
    status: number;
    constructor(status: number, message: string);
}
