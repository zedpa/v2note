/**
 * Goal/Wiki 数据清洗迁移逻辑（纯函数版本）
 *
 * 本文件提取 SQL 迁移的核心决策逻辑为可测试的纯函数。
 * 实际迁移由 067_goal_wiki_data_cleanup.sql 执行。
 */

// ── 类型定义 ──

export interface Todo {
  id: string;
  user_id: string;
  text: string;
  level: number;
  done: boolean;
  status: string;
  wiki_page_id: string | null;
  parent_id: string | null;
  created_at: string; // ISO 时间戳
}

export interface WikiPage {
  id: string;
  user_id: string;
  title: string;
  page_type: 'goal' | 'topic';
  status: 'active' | 'archived' | 'merged';
  parent_id: string | null;
  level: number;
  merged_into: string | null;
  embedding: number[] | null;
  created_at: string;
}

export interface WikiPageRecord {
  wiki_page_id: string;
  record_id: string;
}

export interface SnapshotEntry {
  table_name: string;
  row_id: string;
  column_name: string;
  old_value: string | null;
  new_value: string | null;
}

// ── Step 1: 重复 goal todo 合并 ──

/** 按 user_id + LOWER(TRIM(text)) 分组，找出重复组 */
export function findDuplicateTodoGroups(
  todos: Todo[]
): Map<string, Todo[]> {
  const groups = new Map<string, Todo[]>();

  for (const t of todos) {
    if (t.level < 1 || t.done) continue;
    const key = `${t.user_id}::${t.text.trim().toLowerCase()}`;
    const arr = groups.get(key) || [];
    arr.push(t);
    groups.set(key, arr);
  }

  // 只保留有重复的组
  const result = new Map<string, Todo[]>();
  for (const [key, arr] of groups) {
    if (arr.length > 1) {
      // 按 created_at 排序，最早的是主记录
      arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
      result.set(key, arr);
    }
  }
  return result;
}

/** 确定主记录和要合并的记录 */
export function selectPrimaryTodo(group: Todo[]): {
  primary: Todo;
  duplicates: Todo[];
} {
  const sorted = [...group].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  return {
    primary: sorted[0],
    duplicates: sorted.slice(1),
  };
}

/** 决定 wiki_page_id 是否需要转移 */
export function shouldTransferWikiPageId(
  primary: Todo,
  duplicate: Todo
): boolean {
  return duplicate.wiki_page_id !== null && primary.wiki_page_id === null;
}

// ── Step 2: 重复 goal page 合并 ──

export function findDuplicatePageGroups(
  pages: WikiPage[]
): Map<string, WikiPage[]> {
  const groups = new Map<string, WikiPage[]>();

  for (const p of pages) {
    if (p.page_type !== 'goal' || p.status !== 'active') continue;
    const key = `${p.user_id}::${p.title.trim().toLowerCase()}`;
    const arr = groups.get(key) || [];
    arr.push(p);
    groups.set(key, arr);
  }

  const result = new Map<string, WikiPage[]>();
  for (const [key, arr] of groups) {
    if (arr.length > 1) {
      arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
      result.set(key, arr);
    }
  }
  return result;
}

// ── Step 3: 孤儿 goal todo 修复 ──

export function findOrphanGoalTodos(todos: Todo[]): Todo[] {
  return todos.filter(
    (t) => t.level >= 1 && t.wiki_page_id === null && !t.done
  );
}

/** 尝试按文本匹配已有 goal page */
export function matchTodoToPage(
  todo: Todo,
  pages: WikiPage[]
): WikiPage | null {
  const normText = todo.text.trim().toLowerCase();
  return (
    pages.find(
      (p) =>
        p.user_id === todo.user_id &&
        p.page_type === 'goal' &&
        p.status === 'active' &&
        p.title.trim().toLowerCase() === normText
    ) || null
  );
}

// ── Step 4: 孤儿 goal page 修复 ──

export type OrphanPageAction = 'to_topic' | 'archive';

export function classifyOrphanPage(
  page: WikiPage,
  todos: Todo[],
  records: WikiPageRecord[]
): OrphanPageAction | null {
  if (page.page_type !== 'goal' || page.status !== 'active') return null;

  // 检查是否有活跃的 level>=1 todo 引用此 page
  const hasTodo = todos.some(
    (t) => t.wiki_page_id === page.id && t.level >= 1 && !t.done
  );
  if (hasTodo) return null; // 不是孤儿

  const recordCount = records.filter(
    (r) => r.wiki_page_id === page.id
  ).length;

  return recordCount > 0 ? 'to_topic' : 'archive';
}

// ── Step 5: 空壳 topic page 归档 ──

export function shouldArchiveEmptyTopic(
  page: WikiPage,
  records: WikiPageRecord[],
  allPages: WikiPage[],
  now: Date
): boolean {
  if (page.status !== 'active' || page.page_type !== 'topic') return false;

  const createdAt = new Date(page.created_at);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (createdAt >= sevenDaysAgo) return false;

  const hasRecords = records.some((r) => r.wiki_page_id === page.id);
  if (hasRecords) return false;

  const hasActiveChildren = allPages.some(
    (p) => p.parent_id === page.id && p.status === 'active'
  );
  if (hasActiveChildren) return false;

  return true;
}

// ── Step 6: 过期 suggested 目标清理 ──

export function findExpiredSuggested(
  todos: Todo[],
  now: Date
): Todo[] {
  const fourteenDaysAgo = new Date(
    now.getTime() - 14 * 24 * 60 * 60 * 1000
  );
  return todos.filter(
    (t) =>
      t.level >= 1 &&
      t.status === 'suggested' &&
      !t.done &&
      new Date(t.created_at) < fourteenDaysAgo
  );
}

// ── Step 7: Goal page 重挂载 ──

export function findUnmountedGoalPages(pages: WikiPage[]): WikiPage[] {
  return pages.filter(
    (p) =>
      p.page_type === 'goal' &&
      p.parent_id === null &&
      p.status === 'active'
  );
}

/** 计算 embedding 覆盖率 */
export function calcEmbeddingCoverage(pages: WikiPage[]): number {
  const active = pages.filter((p) => p.status === 'active');
  if (active.length === 0) return 0;
  const withEmbedding = active.filter((p) => p.embedding !== null).length;
  return (withEmbedding / active.length) * 100;
}

/** 简单余弦相似度 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** 找最佳匹配 topic（embedding 方式） */
export function findBestTopicByEmbedding(
  goal: WikiPage,
  topics: WikiPage[],
  threshold = 0.5
): { topicId: string; topicLevel: number; score: number } | null {
  if (!goal.embedding) return null;

  let best: { topicId: string; topicLevel: number; score: number } | null =
    null;

  for (const tp of topics) {
    if (
      tp.user_id !== goal.user_id ||
      tp.page_type !== 'topic' ||
      tp.status !== 'active' ||
      !tp.embedding ||
      tp.id === goal.id
    )
      continue;

    const score = cosineSimilarity(goal.embedding, tp.embedding);
    if (score > threshold && (!best || score > best.score)) {
      best = { topicId: tp.id, topicLevel: tp.level, score };
    }
  }

  return best;
}

/** 计算挂载后的 level */
export function calcMountedLevel(topicLevel: number): number {
  return Math.max(1, topicLevel - 1);
}
