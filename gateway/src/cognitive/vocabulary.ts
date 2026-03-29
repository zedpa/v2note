/**
 * 领域词汇纠错引擎 — 基于用户词汇表的文本纠错
 * 目前实现精确别名匹配，后续可扩展 embedding 相似度
 */

import * as vocabRepo from "../db/repositories/vocabulary.js";
import type { VocabularyEntry } from "../db/repositories/vocabulary.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface Correction {
  original: string;
  corrected: string;
  confidence: number;
}

export interface CorrectionResult {
  correctedText: string;
  corrections: Correction[];
}

// ── 内存缓存（每设备 5 分钟过期） ──────────────────────────────────────

interface CacheEntry {
  entries: VocabularyEntry[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const vocabCache = new Map<string, CacheEntry>();

async function getVocabulary(deviceId: string): Promise<VocabularyEntry[]> {
  const now = Date.now();
  const cached = vocabCache.get(deviceId);
  if (cached && cached.expiresAt > now) {
    return cached.entries;
  }

  const entries = await vocabRepo.findByDevice(deviceId);
  vocabCache.set(deviceId, { entries, expiresAt: now + CACHE_TTL_MS });
  return entries;
}

/** 清除指定设备的缓存（词汇变更后调用） */
export function invalidateCache(deviceId: string): void {
  vocabCache.delete(deviceId);
}

// ── 纠错逻辑 ──────────────────────────────────────────────────────────

/**
 * 使用用户词汇表纠正文本
 * 1. 获取设备词汇（带缓存）
 * 2. 遍历每个词条的 aliases，在文本中做大小写不敏感匹配
 * 3. 匹配到则替换为正确 term，confidence = 0.95
 */
export async function correctText(
  deviceId: string,
  text: string,
): Promise<CorrectionResult> {
  const vocabulary = await getVocabulary(deviceId);
  const corrections: Correction[] = [];
  let correctedText = text;

  for (const entry of vocabulary) {
    if (!entry.aliases || entry.aliases.length === 0) continue;

    for (const alias of entry.aliases) {
      if (!alias) continue;

      // 大小写不敏感全词匹配（使用正则，转义特殊字符）
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      const matches = correctedText.match(regex);

      if (matches) {
        for (const match of matches) {
          // 仅在别名与正确术语不同时才记录纠正
          if (match !== entry.term) {
            corrections.push({
              original: match,
              corrected: entry.term,
              confidence: 0.95,
            });
          }
        }
        correctedText = correctedText.replace(regex, entry.term);

        // 异步增加频率（不阻塞返回）
        vocabRepo.incrementFrequency(entry.id).catch(() => {});
      }
    }
  }

  return { correctedText, corrections };
}
