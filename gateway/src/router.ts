import type { IncomingMessage, ServerResponse } from "node:http";
import { sendError, HttpError } from "./lib/http-helpers.js";
import { handleCors } from "./middleware/cors.js";

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  query: Record<string, string>,
) => Promise<void> | void;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  get(path: string, handler: Handler) { this.addRoute("GET", path, handler); }
  post(path: string, handler: Handler) { this.addRoute("POST", path, handler); }
  put(path: string, handler: Handler) { this.addRoute("PUT", path, handler); }
  patch(path: string, handler: Handler) { this.addRoute("PATCH", path, handler); }
  delete(path: string, handler: Handler) { this.addRoute("DELETE", path, handler); }

  private addRoute(method: string, path: string, handler: Handler) {
    const paramNames: string[] = [];
    const pattern = path.replace(/:([^/]+)/g, (_match, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    this.routes.push({
      method,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler,
    });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (handleCors(req, res)) return true;

    const urlObj = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = urlObj.pathname;
    const method = req.method ?? "GET";

    // Parse query params
    const query: Record<string, string> = {};
    urlObj.searchParams.forEach((v, k) => { query[k] = v; });

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });

      try {
        await route.handler(req, res, params, query);
      } catch (err: any) {
        if (err instanceof HttpError) {
          sendError(res, err.message, err.status);
        } else {
          console.error(`[router] Error in ${method} ${pathname}:`, err);
          sendError(res, err.message ?? "Internal Server Error", 500);
        }
      }
      return true;
    }

    return false; // not handled
  }
}
