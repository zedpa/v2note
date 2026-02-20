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
/** Extract X-Device-Id header */
export function getDeviceId(req) {
    const id = req.headers["x-device-id"];
    if (!id || typeof id !== "string") {
        throw new HttpError(401, "Missing X-Device-Id header");
    }
    return id;
}
export class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
//# sourceMappingURL=http-helpers.js.map