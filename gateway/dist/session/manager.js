import { SessionContext } from "./context.js";
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
/**
 * Get or create a session for a device.
 */
export function getSession(deviceId) {
    let session = sessions.get(deviceId);
    if (!session) {
        session = {
            id: crypto.randomUUID(),
            deviceId,
            context: new SessionContext(),
            mode: "idle",
            createdAt: new Date(),
            lastActivity: new Date(),
        };
        sessions.set(deviceId, session);
    }
    session.lastActivity = new Date();
    return session;
}
/**
 * Remove a session.
 */
export function removeSession(deviceId) {
    sessions.delete(deviceId);
}
/**
 * Clean up stale sessions.
 */
export function cleanupSessions() {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.lastActivity.getTime() > SESSION_TTL) {
            sessions.delete(id);
        }
    }
}
// Cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);
//# sourceMappingURL=manager.js.map