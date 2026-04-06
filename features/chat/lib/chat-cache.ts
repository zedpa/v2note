/**
 * 聊天消息 IndexedDB 本地缓存
 * spec: chat-persistence.md 场景 3.1-3.6
 */

const DB_NAME = "v2note-chat-cache";
const DB_VERSION = 1;
const STORE_NAME = "messages";

export interface ChatCacheMessage {
  id: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  parts?: any[];
  created_at: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("user_time", ["userId", "created_at"], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** 读取最近 N 条消息（按时间倒序） */
export async function getRecent(
  userId: string,
  limit: number,
): Promise<ChatCacheMessage[]> {
  if (!isAvailable()) return [];
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("user_time");
    const results: ChatCacheMessage[] = [];

    // 使用游标从 user_time 索引末尾（最新）向前遍历
    const range = IDBKeyRange.bound([userId, ""], [userId, "\uffff"]);
    const req = index.openCursor(range, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => resolve([]);
  });
}

/** 读取 created_at < beforeTime 的消息（用于上滑分页） */
export async function getBefore(
  userId: string,
  beforeTime: string,
  limit: number,
): Promise<ChatCacheMessage[]> {
  if (!isAvailable()) return [];
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("user_time");
    const results: ChatCacheMessage[] = [];

    const range = IDBKeyRange.bound([userId, ""], [userId, beforeTime], false, true);
    const req = index.openCursor(range, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => resolve([]);
  });
}

/** 写入单条消息 */
export async function put(msg: ChatCacheMessage): Promise<void> {
  if (!isAvailable()) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(msg);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** 批量写入消息 */
export async function putBatch(msgs: ChatCacheMessage[]): Promise<void> {
  if (!isAvailable() || msgs.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const msg of msgs) {
      store.put(msg);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 清空指定用户的所有缓存消息 */
export async function clearByUser(userId: string): Promise<void> {
  if (!isAvailable()) return;
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("user_time");
    const range = IDBKeyRange.bound([userId, ""], [userId, "\uffff"]);
    const req = index.openCursor(range, "next");
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => resolve();
  });
}

/** 清理旧消息，只保留最近 keepCount 条 */
export async function pruneOld(
  userId: string,
  keepCount: number,
): Promise<void> {
  if (!isAvailable()) return;
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("user_time");
    const range = IDBKeyRange.bound([userId, ""], [userId, "\uffff"]);

    // 先统计总数
    const countReq = index.count(range);
    countReq.onsuccess = () => {
      const total = countReq.result;
      if (total <= keepCount) {
        resolve();
        return;
      }
      // 从最早开始删除 (total - keepCount) 条
      let deleteCount = total - keepCount;
      const cursorReq = index.openCursor(range, "next");
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && deleteCount > 0) {
          cursor.delete();
          deleteCount--;
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => resolve();
    };
    countReq.onerror = () => resolve();
  });
}
