/**
 * 参谋上下文合并 — 为 chat 注入认知引擎数据。
 *
 * 场景：
 * 1. 目标详情"深入讨论"：注入 Strike/Bond 链路、矛盾、完成率
 * 2. 普通 chat 认知注入：关键词检测 + top-3 clusters + alerts
 * 3. 洞察"展开讨论"：矛盾双方 + 相关 cluster 成员 + 时间线
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

/** 加载普通 chat 的认知上下文：top-3 活跃 cluster + 近期矛盾 */
export async function loadChatCognitive(
  userId: string,
): Promise<ChatCognitiveContext> {
  const ctx: ChatCognitiveContext = {
    clusters: [],
    contradictions: [],
    contextString: "",
  };

  // Top-3 clusters by 7-day strike count
  try {
    const rows = await query<{
      id: string;
      nucleus: string;
      member_count: string;
    }>(
      `SELECT s.id, s.nucleus, COUNT(cm.target_strike_id) as member_count
       FROM strike s
       JOIN bond cm ON cm.source_strike_id = s.id AND cm.type = 'cluster_member'
       JOIN strike ms ON ms.id = cm.target_strike_id
         AND ms.created_at >= NOW() - INTERVAL '7 days'
       WHERE s.user_id = $1 AND s.is_cluster = true AND s.status = 'active'
       GROUP BY s.id
       ORDER BY member_count DESC
       LIMIT 3`,
      [userId],
    );
    ctx.clusters = rows.map((r) => ({
      id: r.id,
      name: r.nucleus,
      recentStrikeCount: parseInt(r.member_count, 10),
    }));
  } catch (err: any) {
    console.warn("[advisor-context] Cluster loading failed:", err.message);
  }

  // Recent contradictions (7 days)
  try {
    const rows = await query<{
      a_id: string;
      a_nucleus: string;
      b_id: string;
      b_nucleus: string;
      bond_id: string;
    }>(
      `SELECT sa.id as a_id, sa.nucleus as a_nucleus,
              sb.id as b_id, sb.nucleus as b_nucleus,
              b.id as bond_id
       FROM bond b
       JOIN strike sa ON sa.id = b.source_strike_id
       JOIN strike sb ON sb.id = b.target_strike_id
       WHERE sa.user_id = $1
         AND b.type = 'contradiction'
         AND b.created_at >= NOW() - INTERVAL '7 days'
         AND COALESCE(sa.source_type, 'think') != 'material'
       ORDER BY b.created_at DESC
       LIMIT 5`,
      [userId],
    );
    ctx.contradictions = rows.map((r) => ({
      strikeA: { id: r.a_id, nucleus: r.a_nucleus },
      strikeB: { id: r.b_id, nucleus: r.b_nucleus },
      bondId: r.bond_id,
    }));
  } catch (err: any) {
    console.warn("[advisor-context] Contradiction loading failed:", err.message);
  }

  // 构建可注入字符串
  const parts: string[] = [];
  if (ctx.clusters.length > 0) {
    parts.push("## 用户近期关注主题");
    for (const c of ctx.clusters) {
      parts.push(`- ${c.name}（近7天 ${c.recentStrikeCount} 条相关记录）`);
    }
  }
  if (ctx.contradictions.length > 0) {
    parts.push("\n## 近期思考变化");
    for (const c of ctx.contradictions) {
      parts.push(
        `- 用户之前说「${c.strikeA.nucleus.slice(0, 40)}」，后来又说「${c.strikeB.nucleus.slice(0, 40)}」`,
      );
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

/** 构建目标深入讨论的完整上下文 */
export async function buildGoalDiscussionContext(
  goalId: string,
  userId: string,
): Promise<string> {
  const goal = await goalRepo.findById(goalId);
  if (!goal) return `目标不存在（ID: ${goalId}）`;

  const parts: string[] = [];
  parts.push(`## 目标：${goal.title}`);
  parts.push(`状态：${goal.status}`);

  // 如果有关联 cluster，加载 Strike 链路
  if (goal.cluster_id) {
    try {
      const members = await query<{
        id: string;
        nucleus: string;
        polarity: string;
        created_at: string;
        source_id: string;
      }>(
        `SELECT ms.id, ms.nucleus, ms.polarity, ms.created_at, ms.source_id
         FROM bond cm
         JOIN strike ms ON ms.id = cm.target_strike_id
         WHERE cm.source_strike_id = $1 AND cm.type = 'cluster_member'
         ORDER BY ms.created_at DESC
         LIMIT 20`,
        [goal.cluster_id],
      );

      if (members.length > 0) {
        parts.push("\n### 相关认知记录");
        for (const m of members) {
          const date = toLocalDate(m.created_at);
          const ref = m.source_id ? ` [record:${m.source_id}]` : "";
          parts.push(`- (${m.polarity}, ${date}) ${m.nucleus}${ref}`);
        }
      }

      // 矛盾
      const strikeIds = members.map((m) => m.id);
      if (strikeIds.length > 0) {
        const contradictions = await query<{
          a_nucleus: string;
          b_nucleus: string;
        }>(
          `SELECT sa.nucleus as a_nucleus, sb.nucleus as b_nucleus
           FROM bond b
           JOIN strike sa ON sa.id = b.source_strike_id
           JOIN strike sb ON sb.id = b.target_strike_id
           WHERE b.type = 'contradiction'
             AND (b.source_strike_id = ANY($1) OR b.target_strike_id = ANY($1))
           LIMIT 5`,
          [strikeIds],
        );

        if (contradictions.length > 0) {
          parts.push("\n### ⚠️ 存在不同看法");
          for (const c of contradictions) {
            parts.push(`- 「${c.a_nucleus}」 vs 「${c.b_nucleus}」`);
          }
        }
      }
    } catch (err: any) {
      console.warn("[advisor-context] Goal cluster loading failed:", err.message);
    }
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

  parts.push(
    "\n路路人格：温暖、不催促、不评判。引用用户记录时标注 [record:ID]，引导用户自己思考。",
  );

  return parts.join("\n");
}

// ─── 场景 3: 展开讨论 ───

/** 构建洞察"展开讨论"的上下文（基于矛盾 bond） */
export async function buildInsightDiscussionContext(
  bondId: string,
  userId: string,
): Promise<string> {
  const parts: string[] = [];

  // 加载矛盾双方 Strike
  const contradictionRows = await query<{
    bond_id: string;
    a_id: string;
    a_nucleus: string;
    a_polarity: string;
    a_created_at: string;
    a_source_id: string;
    b_id: string;
    b_nucleus: string;
    b_polarity: string;
    b_created_at: string;
    b_source_id: string;
  }>(
    `SELECT b.id as bond_id,
            sa.id as a_id, sa.nucleus as a_nucleus, sa.polarity as a_polarity,
            sa.created_at as a_created_at, sa.source_id as a_source_id,
            sb.id as b_id, sb.nucleus as b_nucleus, sb.polarity as b_polarity,
            sb.created_at as b_created_at, sb.source_id as b_source_id
     FROM bond b
     JOIN strike sa ON sa.id = b.source_strike_id
     JOIN strike sb ON sb.id = b.target_strike_id
     WHERE b.id = $1`,
    [bondId],
  );

  if (contradictionRows.length === 0) {
    return "未找到相关讨论上下文。";
  }

  const row = contradictionRows[0];

  parts.push("## 思考变化");
  parts.push(
    `\n### 观点 A（${toLocalDate(row.a_created_at)}）`,
  );
  parts.push(`${row.a_nucleus} [record:${row.a_source_id}]`);

  parts.push(
    `\n### 观点 B（${toLocalDate(row.b_created_at)}）`,
  );
  parts.push(`${row.b_nucleus} [record:${row.b_source_id}]`);

  // 加载相关 cluster 成员（通过矛盾双方所在 cluster）
  try {
    const relatedMembers = await query<{
      id: string;
      nucleus: string;
      polarity: string;
      created_at: string;
      source_id: string;
    }>(
      `SELECT DISTINCT ms.id, ms.nucleus, ms.polarity, ms.created_at, ms.source_id
       FROM bond cm
       JOIN strike ms ON ms.id = cm.target_strike_id
       WHERE cm.type = 'cluster_member'
         AND cm.source_strike_id IN (
           SELECT cm2.source_strike_id FROM bond cm2
           WHERE cm2.type = 'cluster_member'
             AND cm2.target_strike_id IN ($1, $2)
         )
         AND ms.id NOT IN ($1, $2)
       ORDER BY ms.created_at DESC
       LIMIT 10`,
      [row.a_id, row.b_id],
    );

    if (relatedMembers.length > 0) {
      parts.push("\n### 相关思考");
      for (const m of relatedMembers) {
        const date = toLocalDate(m.created_at);
        parts.push(`- (${m.polarity}, ${date}) ${m.nucleus} [record:${m.source_id}]`);
      }
    }
  } catch (err: any) {
    console.warn("[advisor-context] Related members failed:", err.message);
  }

  return parts.join("\n");
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
