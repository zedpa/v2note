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
  userId: string;
  context: SessionContext;
  mode: "idle" | "process" | "chat";
  memoryManager: MemoryManager;
  pendingConfirms: Map<string, PendingConfirm>;
  createdAt: Date;
  lastActivity: Date;
}

const sessions = new Map<string, Session>();

const SESSION_TTL = 10 * 60 * 1000; // 10 分钟（从 30 分钟缩短，减少内存占用）
const MAX_SESSIONS = 30; // 单 worker 最大 session 数

/**
 * 淘汰最久未活跃的 session
 */
function evictOldest(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, s] of sessions) {
    const t = s.lastActivity.getTime();
    if (t < oldestTime) {
      oldestTime = t;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    sessions.delete(oldestKey);
    console.log(`[session] Evicted oldest session: ${oldestKey}`);
  }
}

/**
 * Get or create a session for a user.
 */
export function getSession(userId: string): Session {
  let session = sessions.get(userId);
  if (!session) {
    // 超限时淘汰最久未活跃的 session
    if (sessions.size >= MAX_SESSIONS) {
      evictOldest();
    }
    session = {
      id: crypto.randomUUID(),
      userId,
      context: new SessionContext(),
      mode: "idle",
      memoryManager: new MemoryManager(),
      pendingConfirms: new Map(),
      createdAt: new Date(),
      lastActivity: new Date(),
    };
    sessions.set(userId, session);
  }
  session.lastActivity = new Date();
  return session;
}

/**
 * Remove a session.
 */
export function removeSession(userId: string) {
  sessions.delete(userId);
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
