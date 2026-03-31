/**
 * Embedding 磁盘持久缓存
 *
 * 用文件系统存储 embedding 向量，避免进程重启后重新调用 DashScope。
 * 每个 embedding 存为一个 .bin 文件（Float32Array 原始字节），按 key 哈希分桶。
 * 零外部依赖，纯 Node.js fs。
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = process.env.CACHE_DIR
  ? join(process.env.CACHE_DIR, "embeddings")
  : join(process.cwd(), ".cache", "embeddings");

// 最多缓存条数（超出时清理最旧的）
const MAX_ENTRIES = 100_000;

let initialized = false;

function ensureDir() {
  if (initialized) return;
  // 分 256 个子目录，避免单目录文件过多
  for (let i = 0; i < 256; i++) {
    const sub = join(CACHE_DIR, i.toString(16).padStart(2, "0"));
    mkdirSync(sub, { recursive: true });
  }
  initialized = true;
}

function keyToPath(key: string): string {
  const hash = createHash("md5").update(key).digest("hex");
  const bucket = hash.slice(0, 2);
  return join(CACHE_DIR, bucket, `${hash}.bin`);
}

/**
 * 从磁盘读取 embedding 向量
 */
export function getDiskEmbedding(key: string): number[] | null {
  ensureDir();
  const filePath = keyToPath(key);
  try {
    const buf = readFileSync(filePath);
    const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    return Array.from(floats);
  } catch {
    return null;
  }
}

/**
 * 将 embedding 向量写入磁盘
 */
export function setDiskEmbedding(key: string, vector: number[]): void {
  ensureDir();
  const filePath = keyToPath(key);
  const buf = Buffer.from(new Float32Array(vector).buffer);
  try {
    writeFileSync(filePath, buf);
  } catch (err) {
    console.warn("[disk-cache] Write failed:", err);
  }
}

/**
 * 清理旧缓存文件（按修改时间淘汰），启动时调用
 */
export function cleanupDiskCache(maxEntries: number = MAX_ENTRIES): number {
  ensureDir();
  const files: Array<{ path: string; mtime: number }> = [];

  for (let i = 0; i < 256; i++) {
    const sub = join(CACHE_DIR, i.toString(16).padStart(2, "0"));
    try {
      for (const name of readdirSync(sub)) {
        if (!name.endsWith(".bin")) continue;
        const fp = join(sub, name);
        try {
          const stat = statSync(fp);
          files.push({ path: fp, mtime: stat.mtimeMs });
        } catch {}
      }
    } catch {}
  }

  if (files.length <= maxEntries) return 0;

  // 按修改时间排序，删除最旧的
  files.sort((a, b) => a.mtime - b.mtime);
  const toDelete = files.length - maxEntries;
  let deleted = 0;
  for (let i = 0; i < toDelete; i++) {
    try {
      unlinkSync(files[i].path);
      deleted++;
    } catch {}
  }
  console.log(`[disk-cache] Cleaned up ${deleted} old embedding files`);
  return deleted;
}
