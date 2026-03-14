import jwt from "jsonwebtoken";
/** Read the request body as parsed JSON */
export function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            }
            catch {
                reject(new Error("Invalid JSON body"));
            }
        });
        req.on("error", reject);
    });
}
/** Send a JSON response */
export function sendJson(res, data, status = 200) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}
/** Send an error response */
export function sendError(res, message, status = 400) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
}
/** Extract device ID — prefers JWT auth context, falls back to X-Device-Id header */
export function getDeviceId(req) {
    // Try JWT auth first
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const secret = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";
            const payload = jwt.verify(authHeader.slice(7), secret);
            if (payload.deviceId)
                return payload.deviceId;
        }
        catch {
            // JWT invalid — fall through to header
        }
    }
    // Fallback: X-Device-Id header
    const id = req.headers["x-device-id"];
    if (!id || typeof id !== "string") {
        throw new HttpError(401, "Missing X-Device-Id header");
    }
    return id;
}
/**
 * Extract userId from JWT. Returns null if no valid JWT present.
 * Use this for data queries — userId represents the account, not a single device.
 */
export function getUserId(req) {
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const secret = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";
            const payload = jwt.verify(authHeader.slice(7), secret);
            return payload.userId ?? null;
        }
        catch {
            return null;
        }
    }
    return null;
}
export class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
//# sourceMappingURL=http-helpers.js.map