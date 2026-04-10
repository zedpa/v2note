/**
 * 参谋上下文合并 — 为 chat 注入认知引擎数据。
 *
 * 场景：
 * 1. 目标详情"深入讨论"：注入 wiki page 知识、完成率
 * 2. 普通 chat 认知注入：关键词检测 + top-3 wiki pages + 思考变化
 * 3. 洞察"展开讨论"：wiki page 全文
 * 4. 引用格式区分：📝 原声 vs 📄 素材
 * 5. 对话保存为日记：record(source_type='think', type='conversation')
 */

import { query } from "../db/pool.js";
import { toLocalDate } from "../lib/tz.js";
import { recordRepo, goalRepo, todoRepo, transcriptRepo } from "../db/repositories/index.js";
import { digestRecords } from "../handlers/digest.js";

// ─── 场景 2: 关键词检测 ───

/** 检测用户消息是否包含认知相关提问 */
const COGNITIVE_KEYWORDS = [
  /最近.{0,4}(在想|想什么|想的)/,
  /最近.{0,4}(关注|关心)/,
  /焦点/,
  /我.{0,4}(在乎|在意)什么/,
  /认知.{0,4}(变化|演进|趋势)/,
];

export function detectCognitiveQuery(message: string): boolean {
  if (!message) return false;
  return COGNITIVE_KEYWORDS.some((kw) => kw.test(message));
}

// ─── 场景 2: 普通 chat 认知注入 ───

export interface ChatCognitiveContext {
  clusters: Array<{ id: string; name: string; recentStrikeCount: number }>;
  contradictions: Array<{
    strikeA: { id: string; nucleus: string };
    strikeB: { id: string; nucleus: string };
    bondId: string;
  }>;
  /** 可直接注入 system prompt 的文本 */
  contextString: string;
}

/** 加载普通 chat 的认知上下文：最近更新的 wiki 主题 + 矛盾/变化段落 */
export async function loadChatCognitive(
  userId: string,
): Promise<ChatCognitiveContext> {
  const ctx: ChatCognitiveContext = {
    clusters: [],
    contradictions: [],
    contextString: "",
  };

  // Top-3 最近更新的 wiki 页面（替代 cluster）
  try {
    const rows = await query<{
      id: string;
      title: string;
      summary: string | null;
      content: string;
    }>(
      `SELECT id, title, summary, content
       FROM wiki_page
       WHERE user_id = $1 AND status = 'active'
       ORDER BY COALESCE(compiled_at, updated_at) DESC
       LIMIT 3`,
      [userId],
    );
    ctx.clusters = rows.map((r) => ({
      id: r.id,
      name: r.title,
      recentStrikeCount: 0, // wiki 模式不再统计 strike 数
    }));

    // 从 wiki 内容中提取矛盾/变化段落（编译时已标注）
    for (const row of rows) {
      // 搜索包含"之前""后来""变化""矛盾""不同""转变"的段落
      const lines = row.content.split("\n");
      for (const line of lines) {
        if (/之前.*后来|变化|转变|不同.*看法|矛盾/.test(line) && line.trim().length > 10) {
          ctx.contradictions.push({
            strikeA: { id: row.id, nucleus: line.trim().slice(0, 60) },
            strikeB: { id: row.id, nucleus: "" },
            bondId: row.id,
          });
          if (ctx.contradictions.length >= 5) break;
        }
      }
      if (ctx.contradictions.length >= 5) break;
    }
  } catch (err: any) {
    console.warn("[advisor-context] Wiki cognitive loading failed:", err.message);
  }

  // 构建可注入字符串
  const parts: string[] = [];
  if (ctx.clusters.length > 0) {
    parts.push("## 用户近期关注主题");
    for (const c of ctx.clusters) {
      parts.push(`- ${c.name}`);
    }
  }
  if (ctx.contradictions.length > 0) {
    parts.push("\n## 近期思考变化");
    for (const c of ctx.contradictions) {
      if (c.strikeA.nucleus) {
        parts.push(`- ${c.strikeA.nucleus}`);
      }
    }
  }
  if (parts.length > 0) {
    parts.push(
      '\n在对话中自然引用这些内容，用温和措辞。不使用「矛盾」「聚类」「Strike」等术语。',
    );
  }
  ctx.contextString = parts.join("\n");

  return ctx;
}

// ─── 场景 1: 目标详情"深入讨论" ───

/** 构建目标深入讨论的完整上下文（从 wiki_page 加载） */
export async function buildGoalDiscussionContext(
  goalId: string,
  userId: string,
): Promise<string> {
  const goal = await goalRepo.findById(goalId);
  if (!goal) return `目标不存在（ID: ${goalId}）`;

  const parts: string[] = [];
  parts.push(`## 目标：${goal.title}`);
  parts.push(`状态：${goal.status}`);

  // 从 wiki_page 中搜索与目标相关的知识
  try {
    const wikiPages = await query<{
      id: string;
      title: string;
      content: string;
      summary: string | null;
    }>(
      `SELECT id, title, content, summary
       FROM wiki_page
       WHERE user_id = $1 AND status = 'active'
         AND content ILIKE '%' || $2 || '%'
       LIMIT 5`,
      [userId, goal.title.slice(0, 50)],
    );

    if (wikiPages.length > 0) {
      parts.push("\n### 相关知识");
      for (const page of wikiPages) {
        const summary = page.summary ?? page.content.split("\n").slice(0, 3).join(" ").slice(0, 100);
        parts.push(`- **${page.title}**: ${summary}`);
      }
    }
  } catch (err: any) {
    console.warn("[advisor-context] Wiki goal context failed:", err.message);
  }

  // Todo 完成率
  try {
    const todos = await todoRepo.findByGoalId(goalId);
    if (todos.length > 0) {
      const done = todos.filter((t: any) => t.done).length;
      const rate = Math.round((done / todos.length) * 100);
      parts.push(`\n### 行动完成率\n${done}/${todos.length} 已完成（${rate}%）`);
    }
  } catch (err: any) {
    console.warn("[advisor-context] Todo stats failed:", err.message);
  }

  return parts.join("\n");
}

// ─── 场景 3: 展开讨论 ───

/** 构建洞察"展开讨论"的上下文（从 wiki_page 加载） */
export async function buildInsightDiscussionContext(
  /** wiki_page_id 或旧的 bondId（兼容） */
  pageOrBondId: string,
  userId: string,
): Promise<string> {
  const parts: string[] = [];

  // 尝试从 wiki_page 加载
  try {
    const page = await query<{
      id: string;
      title: string;
      content: string;
      summary: string | null;
    }>(
      `SELECT id, title, content, summary
       FROM wiki_page
       WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [pageOrBondId, userId],
    );

    if (page.length > 0) {
      const p = page[0];
      parts.push(`## ${p.title}`);
      parts.push(p.content);
      return parts.join("\n");
    }
  } catch {
    // 非 UUID 或表不存在，跳过
  }

  return "未找到相关讨论上下文。";
}

// ─── 场景 4: 引用格式区分 ───

/** 格式化引用：📝 原声 vs 📄 素材 */
export function formatCitation(record: {
  id: string;
  source_type: string;
  text: string;
  created_at: string;
}): string {
  const date = toLocalDate(record.created_at);
  const snippet = record.text.slice(0, 60);

  if (record.source_type === "material") {
    return `📄 报告中提到「${snippet}」— ${date} [record:${record.id}]`;
  }

  // think, voice, 等均为原声
  return `📝 你说过「${snippet}」— ${date} [record:${record.id}]`;
}

// ─── 场景 5: 对话保存为日记 ───

/** 将对话保存为新 record + transcript，进入 Digest 管道 */
export async function saveConversationAsRecord(
  messages: Array<{ role: string; content: string }>,
  userId: string,
  deviceId: string,
): Promise<string> {
  // 构建对话摘要文本
  const textParts = messages.map((m) => {
    const prefix = m.role === "user" ? "我" : "路路";
    return `${prefix}：${m.content}`;
  });
  const text = textParts.join("\n\n");

  // 创建 record（source_type='think' 代表思考类内容）
  const record = await recordRepo.create({
    user_id: userId,
    device_id: deviceId,
    source_type: "think",
  });

  // 创建 transcript（存储实际文本）
  await transcriptRepo.create({
    record_id: record.id,
    text,
    language: "zh",
  });

  // 触发 Digest 管道（异步，不阻塞）
  digestRecords([record.id], { deviceId, userId }).catch((err: any) => {
    console.warn("[advisor-context] Digest failed:", err.message);
  });

  return record.id;
}
