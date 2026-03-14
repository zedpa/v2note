/**
 * Shared text utility functions.
 * Extracted from context/loader.ts for reuse across gateway modules.
 */

/** Chinese stopwords to exclude from keyword matching */
export const STOPWORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
  "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有",
  "看", "好", "自己", "这", "他", "她", "它", "们", "那", "被", "从", "把",
  "还", "能", "对", "吗", "呢", "吧", "啊", "嗯", "哦", "额", "呃",
]);

/**
 * Extract keywords from Chinese/mixed text.
 * Uses character bigrams + word-level split for broad matching.
 */
// ── Soul/Profile relevance keywords (shared by process.ts + chat.ts) ──

/** Keywords indicating user is defining AI personality/behavior */
export const SOUL_KEYWORDS = ["你要", "你应该", "语气", "风格", "不要", "请用", "像一个", "你是"];

/** Keywords indicating user is sharing personal/factual info */
export const PROFILE_KEYWORDS = ["我是", "我在", "我的工作", "我住", "我喜欢", "我每天", "家人", "同事"];

/** Check if text likely contains soul-relevant content */
export function maySoulUpdate(text: string): boolean {
  return SOUL_KEYWORDS.some(kw => text.includes(kw));
}

/** Check if text likely contains profile-relevant content */
export function mayProfileUpdate(text: string): boolean {
  return PROFILE_KEYWORDS.some(kw => text.includes(kw));
}

export function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();

  // Split on whitespace and common punctuation
  const words = text.split(/[\s,，。！？、；：""''（）()《》\[\]【】\-—…·]+/);
  for (const word of words) {
    const w = word.trim().toLowerCase();
    if (w.length >= 2 && !STOPWORDS.has(w)) {
      keywords.add(w);
    }
  }

  // Add character bigrams for Chinese text
  const cleaned = text.replace(/[a-zA-Z0-9\s\p{P}]/gu, "");
  for (let i = 0; i < cleaned.length - 1; i++) {
    const bigram = cleaned.slice(i, i + 2);
    keywords.add(bigram);
  }

  return keywords;
}
