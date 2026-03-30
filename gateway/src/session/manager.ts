import { SessionContext } from "./context.js";
import { MemoryManager } from "../memory/manager.js";

export interface PendingConfirm {
  confirmId: string;
  action: string;       // e.g. "delete_todo"
  todoId?: string;
  summary: string;      // 展示给用户的确认文案
  expiresAt: number;    // Date.now() + 30000（30秒超时）
}

export interface Session {
  id: string;
  deviceId: string;
  userId?: string;
  context: SessionContext;
  mode: "idle" | "process" | "chat";
  memoryManager: MemoryManager;
  pendingConfirms: Map<string, PendingConfirm>;
  createdAt: Date;
  lastActivity: Date;
}

const sessions = new Map<string, Session>();

const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get or create a session for a device.
 */
export function getSession(deviceId: string): Session {
  let session = sessions.get(deviceId);
  if (!session) {
    session = {
      id: crypto.randomUUID(),
      deviceId,
      context: new SessionContext(),
      mode: "idle",
      memoryManager: new MemoryManager(),
      pendingConfirms: new Map(),
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
export function removeSession(deviceId: string) {
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
