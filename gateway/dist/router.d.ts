import type { IncomingMessage, ServerResponse } from "node:http";
type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, query: Record<string, string>) => Promise<void> | void;
export declare class Router {
    private routes;
    get(path: string, handler: Handler): void;
    post(path: string, handler: Handler): void;
    put(path: string, handler: Handler): void;
    patch(path: string, handler: Handler): void;
    delete(path: string, handler: Handler): void;
    private addRoute;
    handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
}
export {};
