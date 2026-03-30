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

/**
 * 清理 AI 返回的 JSON 字符串：去除 markdown 代码块包裹、思考过程文本等。
 * DashScope qwen3 系列经常返回 ```json ... ``` 或 <think>...</think> 包裹的 JSON。
 */
export function cleanJsonResponse(raw: string): string {
  let s = raw.trim();

  // 移除 <think>...</think> 思考过程（qwen3 系列特性）
  s = s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // 移除 markdown 代码块包裹: ```json ... ``` 或 ``` ... ```
  const fenceMatch = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }

  // 如果开头仍不是 { 或 [，尝试找到第一个 JSON 起始字符
  const jsonStart = s.search(/[{\[]/);
  if (jsonStart > 0) {
    s = s.slice(jsonStart);
  }

  // 如果末尾有多余内容（JSON 后面跟了文字），截断到最后一个 } 或 ]
  const lastBrace = s.lastIndexOf("}");
  const lastBracket = s.lastIndexOf("]");
  const lastJson = Math.max(lastBrace, lastBracket);
  if (lastJson > 0 && lastJson < s.length - 1) {
    s = s.slice(0, lastJson + 1);
  }

  return s;
}

/**
 * 安全解析 AI 返回的 JSON：先清理再解析。
 * 失败时返回 null 而不是抛异常。
 */
export function safeParseJson<T = any>(raw: string): T | null {
  try {
    return JSON.parse(cleanJsonResponse(raw)) as T;
  } catch {
    return null;
  }
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
