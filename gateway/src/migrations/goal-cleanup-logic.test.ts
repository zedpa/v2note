/**
 * Goal/Wiki 数据清洗迁移逻辑 — 单元测试
 * spec: fix-goal-wiki-data-cleanup.md
 */
import { describe, it, expect } from 'vitest';
import {
  findDuplicateTodoGroups,
  selectPrimaryTodo,
  shouldTransferWikiPageId,
  findDuplicatePageGroups,
  findOrphanGoalTodos,
  matchTodoToPage,
  classifyOrphanPage,
  shouldArchiveEmptyTopic,
  findExpiredSuggested,
  findUnmountedGoalPages,
  calcEmbeddingCoverage,
  cosineSimilarity,
  findBestTopicByEmbedding,
  calcMountedLevel,
  Todo,
  WikiPage,
  WikiPageRecord,
} from './goal-cleanup-logic.js';

// ── 工厂函数 ──

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: crypto.randomUUID(),
  user_id: 'user-1',
  text: '学英语',
  level: 1,
  done: false,
  status: 'active',
  wiki_page_id: null,
  parent_id: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makePage = (overrides: Partial<WikiPage> = {}): WikiPage => ({
  id: crypto.randomUUID(),
  user_id: 'user-1',
  title: '学英语',
  page_type: 'goal',
  status: 'active',
  parent_id: null,
  level: 3,
  merged_into: null,
  embedding: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ═══════════════════════════════════════════════════════
// Step 1: 重复 goal todo 合并（场景 1.1）
// ═══════════════════════════════════════════════════════

describe('Step 1: 重复 goal todo 合并', () => {
  it('should_find_duplicate_groups_when_same_normalized_text', () => {
    const todos = [
      makeTodo({ id: 'a', text: '学英语', created_at: '2026-01-01T00:00:00Z' }),
      makeTodo({ id: 'b', text: '  学英语  ', created_at: '2026-01-05T00:00:00Z' }),
      makeTodo({ id: 'c', text: '学英语', created_at: '2026-01-03T00:00:00Z' }),
    ];

    const groups = findDuplicateTodoGroups(todos);
    expect(groups.size).toBe(1);

    const group: Todo[] = Array.from(groups.values())[0];
    expect(group).toHaveLength(3);
    // 按 created_at 排序
    expect(group[0].id).toBe('a');
    expect(group[1].id).toBe('c');
    expect(group[2].id).toBe('b');
  });

  it('should_skip_done_todos_when_finding_duplicates', () => {
    const todos = [
      makeTodo({ id: 'a', text: '学英语', done: false }),
      makeTodo({ id: 'b', text: '学英语', done: true }),
    ];

    const groups = findDuplicateTodoGroups(todos);
    expect(groups.size).toBe(0); // 只有一条 done=false，不算重复
  });

  it('should_skip_level0_todos_when_finding_duplicates', () => {
    const todos = [
      makeTodo({ id: 'a', text: '买牛奶', level: 0 }),
      makeTodo({ id: 'b', text: '买牛奶', level: 0 }),
    ];

    const groups = findDuplicateTodoGroups(todos);
    expect(groups.size).toBe(0);
  });

  it('should_separate_groups_by_user_id', () => {
    const todos = [
      makeTodo({ id: 'a', user_id: 'user-1', text: '学英语' }),
      makeTodo({ id: 'b', user_id: 'user-2', text: '学英语' }),
    ];

    const groups = findDuplicateTodoGroups(todos);
    expect(groups.size).toBe(0); // 不同用户，不算重复
  });

  it('should_be_case_insensitive_when_matching', () => {
    const todos = [
      makeTodo({ id: 'a', text: 'Learn English', created_at: '2026-01-01T00:00:00Z' }),
      makeTodo({ id: 'b', text: 'learn english', created_at: '2026-01-02T00:00:00Z' }),
    ];

    const groups = findDuplicateTodoGroups(todos);
    expect(groups.size).toBe(1);
  });

  it('should_select_earliest_as_primary', () => {
    const group = [
      makeTodo({ id: 'late', created_at: '2026-03-01T00:00:00Z' }),
      makeTodo({ id: 'early', created_at: '2026-01-01T00:00:00Z' }),
      makeTodo({ id: 'mid', created_at: '2026-02-01T00:00:00Z' }),
    ];

    const { primary, duplicates } = selectPrimaryTodo(group);
    expect(primary.id).toBe('early');
    expect(duplicates).toHaveLength(2);
  });

  it('should_transfer_wiki_page_id_when_primary_has_none_and_dup_has_one', () => {
    const primary = makeTodo({ wiki_page_id: null });
    const dup = makeTodo({ wiki_page_id: 'page-1' });
    expect(shouldTransferWikiPageId(primary, dup)).toBe(true);
  });

  it('should_not_transfer_wiki_page_id_when_primary_already_has_one', () => {
    const primary = makeTodo({ wiki_page_id: 'page-a' });
    const dup = makeTodo({ wiki_page_id: 'page-b' });
    expect(shouldTransferWikiPageId(primary, dup)).toBe(false);
  });

  it('should_not_transfer_wiki_page_id_when_dup_has_none', () => {
    const primary = makeTodo({ wiki_page_id: null });
    const dup = makeTodo({ wiki_page_id: null });
    expect(shouldTransferWikiPageId(primary, dup)).toBe(false);
  });

  it('should_not_find_duplicates_when_all_unique', () => {
    const todos = [
      makeTodo({ text: '学英语' }),
      makeTodo({ text: '学法语' }),
      makeTodo({ text: '学日语' }),
    ];
    const groups = findDuplicateTodoGroups(todos);
    expect(groups.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// Step 2: 重复 goal page 合并（场景 1.2）
// ═══════════════════════════════════════════════════════

describe('Step 2: 重复 goal page 合并', () => {
  it('should_find_duplicate_page_groups_when_same_title', () => {
    const pages = [
      makePage({ id: 'p1', title: '学英语', created_at: '2026-01-01T00:00:00Z' }),
      makePage({ id: 'p2', title: '  学英语  ', created_at: '2026-01-05T00:00:00Z' }),
    ];

    const groups = findDuplicatePageGroups(pages);
    expect(groups.size).toBe(1);
    const group: WikiPage[] = Array.from(groups.values())[0];
    expect(group[0].id).toBe('p1'); // 最早的在前
  });

  it('should_skip_non_goal_pages', () => {
    const pages = [
      makePage({ id: 'p1', title: '学英语', page_type: 'topic' }),
      makePage({ id: 'p2', title: '学英语', page_type: 'topic' }),
    ];

    const groups = findDuplicatePageGroups(pages);
    expect(groups.size).toBe(0);
  });

  it('should_skip_non_active_pages', () => {
    const pages = [
      makePage({ id: 'p1', title: '学英语', status: 'active' }),
      makePage({ id: 'p2', title: '学英语', status: 'merged' }),
    ];

    const groups = findDuplicatePageGroups(pages);
    expect(groups.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// Step 3: 孤儿 goal todo（场景 2.1）
// ═══════════════════════════════════════════════════════

describe('Step 3: 孤儿 goal todo 修复', () => {
  it('should_find_orphan_todos_when_level_gte_1_and_no_page', () => {
    const todos = [
      makeTodo({ id: 'a', level: 1, wiki_page_id: null }),
      makeTodo({ id: 'b', level: 2, wiki_page_id: 'page-1' }),
      makeTodo({ id: 'c', level: 0, wiki_page_id: null }),
    ];

    const orphans = findOrphanGoalTodos(todos);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].id).toBe('a');
  });

  it('should_skip_done_orphans', () => {
    const todos = [
      makeTodo({ level: 1, wiki_page_id: null, done: true }),
    ];
    expect(findOrphanGoalTodos(todos)).toHaveLength(0);
  });

  it('should_match_todo_to_existing_page_by_text', () => {
    const todo = makeTodo({ text: '学英语', user_id: 'user-1' });
    const pages = [
      makePage({ title: '学英语', user_id: 'user-1', page_type: 'goal', status: 'active' }),
    ];

    const matched = matchTodoToPage(todo, pages);
    expect(matched).not.toBeNull();
    expect(matched!.title).toBe('学英语');
  });

  it('should_not_match_when_different_user', () => {
    const todo = makeTodo({ text: '学英语', user_id: 'user-1' });
    const pages = [
      makePage({ title: '学英语', user_id: 'user-2' }),
    ];

    expect(matchTodoToPage(todo, pages)).toBeNull();
  });

  it('should_not_match_archived_pages', () => {
    const todo = makeTodo({ text: '学英语', user_id: 'user-1' });
    const pages = [
      makePage({ title: '学英语', user_id: 'user-1', status: 'archived' }),
    ];

    expect(matchTodoToPage(todo, pages)).toBeNull();
  });

  it('should_match_case_insensitive_with_trim', () => {
    const todo = makeTodo({ text: '  Learn English  ' });
    const pages = [
      makePage({ title: 'learn english', user_id: 'user-1', page_type: 'goal', status: 'active' }),
    ];

    expect(matchTodoToPage(todo, pages)).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
// Step 4: 孤儿 goal page（场景 2.2）
// ═══════════════════════════════════════════════════════

describe('Step 4: 孤儿 goal page 修复', () => {
  it('should_classify_as_topic_when_has_records', () => {
    const page = makePage({ id: 'p1' });
    const todos: Todo[] = []; // 无引用 todo
    const records: WikiPageRecord[] = [
      { wiki_page_id: 'p1', record_id: 'r1' },
    ];

    expect(classifyOrphanPage(page, todos, records)).toBe('to_topic');
  });

  it('should_classify_as_archive_when_no_records', () => {
    const page = makePage({ id: 'p1' });
    const todos: Todo[] = [];
    const records: WikiPageRecord[] = [];

    expect(classifyOrphanPage(page, todos, records)).toBe('archive');
  });

  it('should_return_null_when_page_has_active_todo', () => {
    const page = makePage({ id: 'p1' });
    const todos: Todo[] = [
      makeTodo({ wiki_page_id: 'p1', level: 1, done: false }),
    ];
    const records: WikiPageRecord[] = [];

    expect(classifyOrphanPage(page, todos, records)).toBeNull();
  });

  it('should_return_null_when_page_is_not_goal', () => {
    const page = makePage({ id: 'p1', page_type: 'topic' });
    expect(classifyOrphanPage(page, [], [])).toBeNull();
  });

  it('should_return_null_when_page_is_not_active', () => {
    const page = makePage({ id: 'p1', status: 'archived' });
    expect(classifyOrphanPage(page, [], [])).toBeNull();
  });

  it('should_ignore_done_todos_when_checking_orphan', () => {
    const page = makePage({ id: 'p1' });
    const todos: Todo[] = [
      makeTodo({ wiki_page_id: 'p1', level: 1, done: true }), // done 不算
    ];
    const records: WikiPageRecord[] = [];

    expect(classifyOrphanPage(page, todos, records)).toBe('archive');
  });
});

// ═══════════════════════════════════════════════════════
// Step 5: 空壳 topic page 归档（场景 3.1 + 3.2）
// ═══════════════════════════════════════════════════════

describe('Step 5: 空壳 topic page 归档', () => {
  const now = new Date('2026-04-13T12:00:00Z');

  it('should_archive_empty_old_topic_when_no_records_no_children', () => {
    const page = makePage({
      page_type: 'topic',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z', // 超过 7 天
    });

    expect(shouldArchiveEmptyTopic(page, [], [], now)).toBe(true);
  });

  it('should_not_archive_when_has_records', () => {
    const page = makePage({
      id: 'p1',
      page_type: 'topic',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
    });
    const records: WikiPageRecord[] = [
      { wiki_page_id: 'p1', record_id: 'r1' },
    ];

    expect(shouldArchiveEmptyTopic(page, records, [], now)).toBe(false);
  });

  it('should_not_archive_when_has_active_children', () => {
    const page = makePage({
      id: 'p1',
      page_type: 'topic',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
    });
    const children = [
      makePage({ parent_id: 'p1', status: 'active' }),
    ];

    expect(shouldArchiveEmptyTopic(page, [], children, now)).toBe(false);
  });

  it('should_not_archive_when_created_less_than_7_days_ago', () => {
    const page = makePage({
      page_type: 'topic',
      status: 'active',
      created_at: '2026-04-10T00:00:00Z', // 3 天前
    });

    expect(shouldArchiveEmptyTopic(page, [], [], now)).toBe(false);
  });

  it('should_not_archive_non_topic_pages', () => {
    const page = makePage({
      page_type: 'goal',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(shouldArchiveEmptyTopic(page, [], [], now)).toBe(false);
  });

  it('should_not_archive_already_archived_pages', () => {
    const page = makePage({
      page_type: 'topic',
      status: 'archived',
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(shouldArchiveEmptyTopic(page, [], [], now)).toBe(false);
  });

  it('should_ignore_archived_children_when_checking', () => {
    const page = makePage({
      id: 'p1',
      page_type: 'topic',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
    });
    const children = [
      makePage({ parent_id: 'p1', status: 'archived' }), // archived 子页面不算
    ];

    expect(shouldArchiveEmptyTopic(page, [], children, now)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// Step 6: 过期 suggested 目标清理（场景 5.1）
// ═══════════════════════════════════════════════════════

describe('Step 6: 过期 suggested 目标清理', () => {
  const now = new Date('2026-04-13T12:00:00Z');

  it('should_find_expired_suggested_when_older_than_14_days', () => {
    const todos = [
      makeTodo({
        id: 'a',
        status: 'suggested',
        level: 1,
        done: false,
        created_at: '2026-03-01T00:00:00Z', // 超过 14 天
      }),
    ];

    const expired = findExpiredSuggested(todos, now);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe('a');
  });

  it('should_not_find_recent_suggested', () => {
    const todos = [
      makeTodo({
        status: 'suggested',
        level: 1,
        created_at: '2026-04-10T00:00:00Z', // 3 天前
      }),
    ];

    expect(findExpiredSuggested(todos, now)).toHaveLength(0);
  });

  it('should_not_find_non_suggested_status', () => {
    const todos = [
      makeTodo({
        status: 'active',
        level: 1,
        created_at: '2026-01-01T00:00:00Z',
      }),
    ];

    expect(findExpiredSuggested(todos, now)).toHaveLength(0);
  });

  it('should_not_find_done_suggested', () => {
    const todos = [
      makeTodo({
        status: 'suggested',
        level: 1,
        done: true,
        created_at: '2026-01-01T00:00:00Z',
      }),
    ];

    expect(findExpiredSuggested(todos, now)).toHaveLength(0);
  });

  it('should_not_find_level0_suggested', () => {
    const todos = [
      makeTodo({
        status: 'suggested',
        level: 0,
        created_at: '2026-01-01T00:00:00Z',
      }),
    ];

    expect(findExpiredSuggested(todos, now)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════
// Step 7: Goal page 重挂载（场景 4.1 + 4.2）
// ═══════════════════════════════════════════════════════

describe('Step 7: Goal page 重挂载', () => {
  it('should_find_unmounted_goal_pages', () => {
    const pages = [
      makePage({ id: 'p1', parent_id: null, page_type: 'goal', status: 'active' }),
      makePage({ id: 'p2', parent_id: 'topic-1', page_type: 'goal', status: 'active' }),
      makePage({ id: 'p3', parent_id: null, page_type: 'topic', status: 'active' }),
    ];

    const unmounted = findUnmountedGoalPages(pages);
    expect(unmounted).toHaveLength(1);
    expect(unmounted[0].id).toBe('p1');
  });

  it('should_calc_embedding_coverage_correctly', () => {
    const pages = [
      makePage({ status: 'active', embedding: [1, 0, 0] }),
      makePage({ status: 'active', embedding: null }),
      makePage({ status: 'active', embedding: [0, 1, 0] }),
      makePage({ status: 'archived', embedding: null }), // 不计入
    ];

    // 3 active, 2 with embedding → 66.67%
    const coverage = calcEmbeddingCoverage(pages);
    expect(coverage).toBeCloseTo(66.67, 1);
  });

  it('should_return_0_coverage_when_no_active_pages', () => {
    expect(calcEmbeddingCoverage([])).toBe(0);
  });

  it('should_compute_cosine_similarity_correctly', () => {
    // 完全相同的向量 → 1.0
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    // 正交向量 → 0.0
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
    // 反方向 → -1.0
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0);
  });

  it('should_find_best_topic_by_embedding_when_above_threshold', () => {
    const goal = makePage({
      id: 'g1',
      user_id: 'u1',
      page_type: 'goal',
      embedding: [1, 0, 0],
    });
    const topics = [
      makePage({
        id: 't1',
        user_id: 'u1',
        page_type: 'topic',
        status: 'active',
        level: 2,
        embedding: [0.9, 0.1, 0], // 高相似度
      }),
      makePage({
        id: 't2',
        user_id: 'u1',
        page_type: 'topic',
        status: 'active',
        level: 3,
        embedding: [0, 1, 0], // 低相似度
      }),
    ];

    const result = findBestTopicByEmbedding(goal, topics);
    expect(result).not.toBeNull();
    expect(result!.topicId).toBe('t1');
    expect(result!.score).toBeGreaterThan(0.5);
  });

  it('should_return_null_when_all_below_threshold', () => {
    const goal = makePage({
      id: 'g1',
      user_id: 'u1',
      page_type: 'goal',
      embedding: [1, 0, 0],
    });
    const topics = [
      makePage({
        id: 't1',
        user_id: 'u1',
        page_type: 'topic',
        status: 'active',
        embedding: [0, 1, 0], // 正交 = 0
      }),
    ];

    expect(findBestTopicByEmbedding(goal, topics)).toBeNull();
  });

  it('should_return_null_when_goal_has_no_embedding', () => {
    const goal = makePage({ embedding: null });
    expect(findBestTopicByEmbedding(goal, [])).toBeNull();
  });

  it('should_not_match_different_user_topics', () => {
    const goal = makePage({
      user_id: 'u1',
      page_type: 'goal',
      embedding: [1, 0, 0],
    });
    const topics = [
      makePage({
        user_id: 'u2', // 不同用户
        page_type: 'topic',
        status: 'active',
        embedding: [1, 0, 0], // 完全匹配
      }),
    ];

    expect(findBestTopicByEmbedding(goal, topics)).toBeNull();
  });

  it('should_calc_mounted_level_correctly', () => {
    expect(calcMountedLevel(3)).toBe(2);
    expect(calcMountedLevel(2)).toBe(1);
    expect(calcMountedLevel(1)).toBe(1); // Math.max(1, 0) = 1
    expect(calcMountedLevel(0)).toBe(1); // Math.max(1, -1) = 1
  });
});

// ═══════════════════════════════════════════════════════
// 幂等性验证
// ═══════════════════════════════════════════════════════

describe('幂等性: 已处理数据不会被重复处理', () => {
  it('should_not_find_duplicates_when_dups_already_done', () => {
    const todos = [
      makeTodo({ id: 'a', text: '学英语', done: false }),
      makeTodo({ id: 'b', text: '学英语', done: true, status: 'completed' }), // 已合并
    ];

    const groups = findDuplicateTodoGroups(todos);
    expect(groups.size).toBe(0);
  });

  it('should_not_find_duplicate_pages_when_already_merged', () => {
    const pages = [
      makePage({ id: 'p1', title: '学英语', status: 'active' }),
      makePage({ id: 'p2', title: '学英语', status: 'merged' }), // 已合并
    ];

    const groups = findDuplicatePageGroups(pages);
    expect(groups.size).toBe(0);
  });

  it('should_not_find_orphan_todos_when_already_linked', () => {
    const todos = [
      makeTodo({ level: 1, wiki_page_id: 'page-1', done: false }),
    ];

    expect(findOrphanGoalTodos(todos)).toHaveLength(0);
  });

  it('should_not_find_expired_suggested_when_already_dismissed', () => {
    const now = new Date('2026-04-13T12:00:00Z');
    const todos = [
      makeTodo({
        status: 'dismissed',
        done: true,
        level: 1,
        created_at: '2026-01-01T00:00:00Z',
      }),
    ];

    expect(findExpiredSuggested(todos, now)).toHaveLength(0);
  });

  it('should_not_find_unmounted_pages_when_already_has_parent', () => {
    const pages = [
      makePage({ parent_id: 'topic-1', page_type: 'goal', status: 'active' }),
    ];

    expect(findUnmountedGoalPages(pages)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════
// 边界条件
// ═══════════════════════════════════════════════════════

describe('边界条件', () => {
  it('should_handle_empty_todo_list', () => {
    expect(findDuplicateTodoGroups([])).toEqual(new Map());
    expect(findOrphanGoalTodos([])).toEqual([]);
    expect(findExpiredSuggested([], new Date())).toEqual([]);
  });

  it('should_handle_empty_page_list', () => {
    expect(findDuplicatePageGroups([])).toEqual(new Map());
    expect(findUnmountedGoalPages([])).toEqual([]);
    expect(calcEmbeddingCoverage([])).toBe(0);
  });

  it('should_handle_cosine_similarity_with_zero_vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('should_handle_single_todo_no_duplicates', () => {
    const todos = [makeTodo({ level: 1 })];
    expect(findDuplicateTodoGroups(todos).size).toBe(0);
  });
});
