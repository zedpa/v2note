/**
 * 确定性预抽取 — 正则提取结构化信息，减少 AI token 消耗
 *
 * 提取内容存入 record.metadata.pre_extract:
 * - dates: ISO 日期字符串数组
 * - amounts: 金额字符串数组（保留原文格式）
 * - mentions: @提及的人名数组
 * - urls: URL 数组
 */

export interface PreExtractResult {
  dates: string[];
  amounts: string[];
  mentions: string[];
  urls: string[];
}

// 日期模式（中文和 ISO 格式）
const DATE_PATTERNS = [
  /(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})[日号]?/g,     // 2026年4月24日, 2026-04-24
  /(下?周[一二三四五六日天])/g,                              // 周一, 下周三
  /(明天|后天|大后天|昨天|前天|今天)/g,                       // 相对日期
  /(\d{1,2})[月](\d{1,2})[日号]/g,                          // 4月24日
];

// 金额模式
const AMOUNT_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*[万亿]?[元块](?:钱)?/g,               // 100元, 5.5万元
  /[¥￥]\s*(\d+(?:,?\d{3})*(?:\.\d+)?)/g,                    // ¥100, ￥5,000.50
  /(\d+(?:,?\d{3})*(?:\.\d+)?)\s*(?:美元|USD|刀)/g,          // 100美元, 100USD
];

// @提及
const MENTION_PATTERN = /@([\u4e00-\u9fa5a-zA-Z]\S{0,10})/g;

// URL
const URL_PATTERN = /https?:\/\/[^\s<>'")\]]+/gi;

export function preExtract(text: string): PreExtractResult {
  const result: PreExtractResult = { dates: [], amounts: [], mentions: [], urls: [] };
  if (!text) return result;

  // 提取日期
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      result.dates.push(match[0]);
    }
  }

  // 提取金额
  for (const pattern of AMOUNT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      result.amounts.push(match[0]);
    }
  }

  // 提取 @提及
  MENTION_PATTERN.lastIndex = 0;
  let mentionMatch: RegExpExecArray | null;
  while ((mentionMatch = MENTION_PATTERN.exec(text)) !== null) {
    result.mentions.push(mentionMatch[1]);
  }

  // 提取 URL
  URL_PATTERN.lastIndex = 0;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = URL_PATTERN.exec(text)) !== null) {
    result.urls.push(urlMatch[0]);
  }

  // 去重
  result.dates = [...new Set(result.dates)];
  result.amounts = [...new Set(result.amounts)];
  result.mentions = [...new Set(result.mentions)];
  result.urls = [...new Set(result.urls)];

  return result;
}

/** 检查是否有任何提取结果 */
export function hasExtraction(result: PreExtractResult): boolean {
  return result.dates.length > 0 || result.amounts.length > 0 ||
         result.mentions.length > 0 || result.urls.length > 0;
}
