import { sendError, HttpError } from "./lib/http-helpers.js";
import { handleCors } from "./middleware/cors.js";
export class Router {
    routes = [];
    get(path, handler) { this.addRoute("GET", path, handler); }
    post(path, handler) { this.addRoute("POST", path, handler); }
    put(path, handler) { this.addRoute("PUT", path, handler); }
    patch(path, handler) { this.addRoute("PATCH", path, handler); }
    delete(path, handler) { this.addRoute("DELETE", path, handler); }
    addRoute(method, path, handler) {
        const paramNames = [];
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
    async handle(req, res) {
        if (handleCors(req, res))
            return true;
        const urlObj = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const pathname = urlObj.pathname;
        const method = req.method ?? "GET";
        // Parse query params
        const query = {};
        urlObj.searchParams.forEach((v, k) => { query[k] = v; });
        for (const route of this.routes) {
            if (route.method !== method)
                continue;
            const match = pathname.match(route.pattern);
            if (!match)
                continue;
            const params = {};
            route.paramNames.forEach((name, i) => {
                params[name] = decodeURIComponent(match[i + 1]);
            });
            try {
                await route.handler(req, res, params, query);
            }
            catch (err) {
                if (err instanceof HttpError) {
                    sendError(res, err.message, err.status);
                }
                else {
                    console.error(`[router] Error in ${method} ${pathname}:`, err);
                    sendError(res, err.message ?? "Internal Server Error", 500);
                }
            }
            return true;
        }
        return false; // not handled
    }
}
//# sourceMappingURL=router.js.map