import type { IncomingMessage } from "node:http";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt.js";
import { HttpError } from "../lib/http-helpers.js";

export interface AuthContext {
  userId: string;
  deviceId: string;
}

/**
 * Extract auth context from Authorization header.
 * Returns userId + deviceId from the JWT.
 */
export function getAuthContext(req: IncomingMessage): AuthContext {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing or invalid Authorization header");
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    return { userId: payload.userId, deviceId: payload.deviceId };
  } catch {
    throw new HttpError(401, "Invalid or expired access token");
  }
}

/**
 * Try to extract auth context; returns null if no auth header present.
 * Useful for endpoints that support both authenticated and unauthenticated access.
 */
export function tryGetAuthContext(req: IncomingMessage): AuthContext | null {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  try {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    return { userId: payload.userId, deviceId: payload.deviceId };
  } catch {
    return null;
  }
}
