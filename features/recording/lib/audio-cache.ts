/**
 * 本地录音缓存 — IndexedDB 封装
 * 录音时双写：发送 gateway + 存本地副本
 * 失败时保留本地副本供重试，成功后由用户决定是否删除
 */

const DB_NAME = "v2note-audio-cache";
const STORE_NAME = "pending_audio";
const DB_VERSION = 1;

export interface PendingAudio {
  id: string;
  recordId?: string;        // 后端 record ID（占位创建后回写）
  pcmData: ArrayBuffer;     // 完整 PCM 音频（16kHz 16-bit mono）
  duration: number;         // 秒数
  sourceContext: "todo" | "timeline" | "chat" | "review";
  forceCommand: boolean;
  notebook: string | null;
  createdAt: string;        // ISO 8601
  status: "pending" | "completed";
  lastError?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("recordId", "recordId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 合并多个 ArrayBuffer 为一个 */
export function mergeChunks(chunks: ArrayBuffer[]): ArrayBuffer {
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

/** 为 PCM 数据添加 WAV 文件头（16kHz 16-bit mono） */
export function addWavHeader(pcmData: ArrayBuffer): ArrayBuffer {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.byteLength;
  const headerSize = 44;

  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);          // SubChunk1Size (PCM=16)
  view.setUint16(20, 1, true);           // AudioFormat (PCM=1)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // PCM data
  new Uint8Array(buffer, headerSize).set(new Uint8Array(pcmData));

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** 保存录音到 IndexedDB */
export async function saveAudio(entry: PendingAudio): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** 按 ID 获取缓存 */
export async function getAudio(id: string): Promise<PendingAudio | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result ?? undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** 按 recordId 获取缓存 */
export async function getAudioByRecordId(recordId: string): Promise<PendingAudio | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const idx = tx.objectStore(STORE_NAME).index("recordId");
    const req = idx.get(recordId);
    req.onsuccess = () => { db.close(); resolve(req.result ?? undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** 删除缓存 */
export async function deleteAudio(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** 获取所有 pending 状态的缓存 */
export async function getAllPending(): Promise<PendingAudio[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const idx = tx.objectStore(STORE_NAME).index("status");
    const req = idx.getAll("pending");
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** 标记为已完成（不删除，由用户决定） */
export async function markCompleted(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) {
        req.result.status = "completed";
        store.put(req.result);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** 更新 recordId（占位 record 创建后回写） */
export async function updateRecordId(id: string, recordId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) {
        req.result.recordId = recordId;
        store.put(req.result);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** 获取缓存统计信息 */
export async function getCacheStats(): Promise<{ count: number; totalBytes: number; pendingCount: number }> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const items: PendingAudio[] = req.result;
      db.close();
      resolve({
        count: items.length,
        totalBytes: items.reduce((sum, item) => sum + item.pcmData.byteLength, 0),
        pendingCount: items.filter((item) => item.status === "pending").length,
      });
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** 检查缓存总大小是否超过阈值（50MB） */
const CACHE_SIZE_WARN_THRESHOLD = 50 * 1024 * 1024;

export async function checkCacheSize(): Promise<boolean> {
  const stats = await getCacheStats();
  return stats.totalBytes > CACHE_SIZE_WARN_THRESHOLD;
}
