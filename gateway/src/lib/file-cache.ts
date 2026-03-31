/**
 * 通用文件缓存（Soul/Profile 等高频读低频写数据）
 *
 * 两级缓存：内存 LRU(5min) → 磁盘文件(1h) → 数据源
 * 写入时 write-through 两层
 */

import { readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const BASE_DIR = process.env.CACHE_DIR
  ? process.env.CACHE_DIR
  : join(process.cwd(), ".cache");

interface MemEntry<T> {
  value: T;
  cachedAt: number;
}

export interface FileCache<T> {
  get(key: string): T | null;
  set(key: string, value: T): void;
  invalidate(key: string): void;
}

/**
 * 创建一个带磁盘持久层的缓存
 * @param namespace 缓存命名空间（如 'soul', 'profile'）
 * @param memTtlMs 内存层 TTL（默认 5 分钟）
 * @param diskTtlMs 磁盘层 TTL（默认 1 小时）
 */
export function createFileCache<T>(
  namespace: string,
  memTtlMs: number = 5 * 60 * 1000,
  diskTtlMs: number = 60 * 60 * 1000,
): FileCache<T> {
  const dir = join(BASE_DIR, namespace);
  mkdirSync(dir, { recursive: true });

  // 内存层 LRU（简单 Map，定期清理）
  const memCache = new Map<string, MemEntry<T>>();
  const MAX_MEM = 200;

  // 每 5 分钟清理过期内存条目
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memCache) {
      if (now - v.cachedAt > memTtlMs) memCache.delete(k);
    }
  }, memTtlMs);

  function filePath(key: string): string {
    // 安全文件名：只保留字母数字和横线
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
    return join(dir, `${safe}.json`);
  }

  return {
    get(key: string): T | null {
      // 1. 查内存
      const mem = memCache.get(key);
      if (mem && Date.now() - mem.cachedAt < memTtlMs) {
        return mem.value;
      }

      // 2. 查磁盘
      const fp = filePath(key);
      try {
        const stat = statSync(fp);
        if (Date.now() - stat.mtimeMs > diskTtlMs) return null;
        const data = JSON.parse(readFileSync(fp, "utf8")) as T;
        // 回填内存
        memCache.set(key, { value: data, cachedAt: Date.now() });
        if (memCache.size > MAX_MEM) {
          // 删除最旧的
          const oldest = memCache.keys().next().value;
          if (oldest !== undefined) memCache.delete(oldest);
        }
        return data;
      } catch {
        return null;
      }
    },

    set(key: string, value: T): void {
      // write-through：同时写内存和磁盘
      memCache.set(key, { value, cachedAt: Date.now() });
      if (memCache.size > MAX_MEM) {
        const oldest = memCache.keys().next().value;
        if (oldest !== undefined) memCache.delete(oldest);
      }
      try {
        writeFileSync(filePath(key), JSON.stringify(value));
      } catch (err) {
        console.warn(`[file-cache:${namespace}] Write failed:`, err);
      }
    },

    invalidate(key: string): void {
      memCache.delete(key);
      try { unlinkSync(filePath(key)); } catch {}
    },
  };
}
