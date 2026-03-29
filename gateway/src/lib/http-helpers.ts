import type { IncomingMessage, ServerResponse } from "node:http";
import jwt from "jsonwebtoken";

/** Read the request body as parsed JSON */
export function readBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {} as T);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/** Send a JSON response */
export function sendJson(res: ServerResponse, data: any, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

/** Send an error response */
export function sendError(res: ServerResponse, message: string, status = 400): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: message }));
}

/** Extract device ID — prefers JWT auth context, falls back to X-Device-Id header */
export function getDeviceId(req: IncomingMessage): string {
  // Try JWT auth first
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const secret = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";
      const payload = jwt.verify(authHeader.slice(7), secret) as { deviceId?: string };
      if (payload.deviceId) return payload.deviceId;
    } catch {
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
export function getUserId(req: IncomingMessage): string | null {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const secret = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";
      const payload = jwt.verify(authHeader.slice(7), secret) as { userId?: string };
      return payload.userId ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
