/**
 * Agent 自适应 — 交互偏好学习 + Soul 守护。
 *
 * 核心原则：
 * - 偏好融入 Memory（source='interaction'），不新建表
 * - Soul 只在用户显式要求时更新（严格门控）
 * - 偏好需 evidence_count >= 3 才持久化
 * - 旧偏好自动衰减（60天 stale，90天删除）
 */

import { query, execute } from "../db/pool.js";

// ─── 场景 4: Soul 守护 — 严格门控 ───

/** 严格的 Soul 更新正则（替代宽泛的 maySoulUpdate） */
const SOUL_UPDATE_PATTERNS = [
  /你(以后|今后|之后).{0,6}(要|可以|不要|别|简洁|啰嗦|客气)/,
  /你.{0,4}(风格|语气|方式)/,
  /(叫我|称呼我|喊我)/,
  /你(太|不够)(啰嗦|简洁|客气|正式|随意)/,
  /你(不要|别)(那么|这么)(客气|正式|随意|啰嗦)/,
];

export function shouldUpdateSoulStrict(userMessages: string[]): boolean {
  return userMessages.some((msg) =>
    SOUL_UPDATE_PATTERNS.some((pattern) => pattern.test(msg)),
  );
}

// ─── 场景 1: Plan 偏好提取 ───

export interface PreferenceExtraction {
  content: string;
  evidenceCount: number;
}

/** 比对 Plan 的 original vs final steps，提取偏好 */
export function extractPlanPreference(
  originalSteps: string[],
  finalSteps: string[],
  similarCount: number,
): PreferenceExtraction | null {
  if (similarCount < 3) return null;

  // 找出新增的步骤
  const added = finalSteps.filter((s) => !originalSteps.includes(s));
  // 找出被删除的步骤
  const removed = originalSteps.filter((s) => !finalSteps.includes(s));

  if (added.length === 0 && removed.length === 0) return null;

  const parts: string[] = [];
  if (added.length > 0) {
    parts.push(`用户倾向于在方案中加入：${added.join("、")}`);
  }
  if (removed.length > 0) {
    parts.push(`用户倾向于移除：${removed.join("、")}`);
  }

  return {
    content: parts.join("；"),
    evidenceCount: similarCount,
  };
}

// ─── 场景 3: 偏好注入 prompt ───

/** 将偏好列表格式化为可注入 system prompt 的文本 */
export function formatPreferencesForPrompt(preferences: string[]): string {
  if (preferences.length === 0) return "";

  const lines = preferences.map((p) => `- ${p}`);
  return `## 用户交互偏好\n${lines.join("\n")}`;
}

// ─── 场景 5: Profile 事实分类 ───

/** 临时事实关键词（出差、旅行、下周、明天等） */
const TEMPORARY_PATTERNS = [
  /下(周|个月|学期)/,
  /(出差|旅行|旅游|度假)/,
  /(明天|后天|这周末)/,
  /(临时|暂时|短期)/,
];

export interface FactClassification {
  type: "persistent" | "temporary";
  expiresInDays?: number;
}

export function classifyProfileFact(factContent: string): FactClassification {
  const isTemporary = TEMPORARY_PATTERNS.some((p) => p.test(factContent));
  if (isTemporary) {
    return { type: "temporary", expiresInDays: 14 };
  }
  return { type: "persistent" };
}

// ─── 场景 6: 偏好衰减 ───

/** 查找超过 staleDays 未验证的交互偏好 */
export async function findStalePreferences(
  userId: string,
  staleDays: number,
): Promise<Array<{ id: string; content: string; updated_at: string }>> {
  return query<{ id: string; content: string; updated_at: string }>(
    `SELECT id, content, updated_at FROM memory
     WHERE user_id = $1
       AND source = 'interaction'
       AND updated_at < NOW() - INTERVAL '${staleDays} days'
     ORDER BY updated_at ASC`,
    [userId],
  );
}

/** 衰减偏好：60天标记 stale，90天删除 */
export async function decayPreferences(userId: string): Promise<void> {
  // 标记 60 天未更新的为 stale
  await execute(
    `UPDATE memory SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{stale}', 'true')
     WHERE user_id = $1
       AND source = 'interaction'
       AND updated_at < NOW() - INTERVAL '60 days'
       AND (metadata->>'stale') IS DISTINCT FROM 'true'`,
    [userId],
  );

  // 删除 90 天未更新的
  await execute(
    `DELETE FROM memory
     WHERE user_id = $1
       AND source = 'interaction'
       AND updated_at < NOW() - INTERVAL '90 days'`,
    [userId],
  );
}

// ─── 场景 7: unmet_request 聚合 ───

export interface UnmetRequestSummary {
  text: string;
  count: number;
}

/** 聚合近 30 天的 unmet_request */
export async function aggregateUnmetRequests(
  userId: string,
): Promise<UnmetRequestSummary[]> {
  const rows = await query<{ request_text: string; count: string }>(
    `SELECT request_text, COUNT(*)::text as count
     FROM unmet_request
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '30 days'
     GROUP BY request_text
     ORDER BY count DESC
     LIMIT 20`,
    [userId],
  );

  return rows.map((r) => ({
    text: r.request_text,
    count: parseInt(r.count, 10),
  }));
}
