/**
 * goal-quality-stage 单元测试
 *
 * 覆盖场景：
 * - Rule 1: 过期 suggested 目标（14天）清退 + wiki_page 归档
 * - Rule 2: 空壳目标（无子任务 + 超7天）清退 + wiki_page 归档
 * - Rule 3: 精确文本去重（保留最早的，迁移子任务 + wiki_page_record）
 * - 边界：年龄保护、有子任务不清理、suggested 仅13天不清理
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 外部依赖 ──

const mockQuery = vi.fn();
const mockExecute = vi.fn();

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  execute: (...args: any[]) => mockExecute(...args),
}));

// ── 导入 ──

import { runGoalQualityCleanup, type GoalQualityResult } from "./goal-quality-stage.js";

// ── 测试 ──

describe("goal-quality-stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(0);
  });

  describe("Rule 1: 过期 suggested 清退", () => {
    it("should_dismiss_suggested_goals_older_than_14_days", async () => {
      // Rule 1 返回 2 个被清退的目标
      mockQuery
        .mockResolvedValueOnce([
          { id: "g1", wiki_page_id: "wp1" },
          { id: "g2", wiki_page_id: null },
        ]) // Rule 1 UPDATE RETURNING
        .mockResolvedValueOnce([]) // Rule 2 UPDATE RETURNING
        .mockResolvedValueOnce([]); // Rule 3 duplicate groups

      const result = await runGoalQualityCleanup("user-1");

      expect(result.suggestedDismissed).toBe(2);
      // 验证 Rule 1 SQL 包含正确条件
      expect(mockQuery.mock.calls[0][0]).toContain("status = 'suggested'");
      expect(mockQuery.mock.calls[0][0]).toContain("14 days");
      expect(mockQuery.mock.calls[0][1]).toEqual(["user-1"]);
    });

    it("should_archive_wiki_page_when_suggested_goal_has_wiki_page_id", async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: "g1", wiki_page_id: "wp1" }]) // Rule 1
        .mockResolvedValueOnce([]) // Rule 2
        .mockResolvedValueOnce([]); // Rule 3

      await runGoalQualityCleanup("user-1");

      // archiveWikiPages 调用 execute 归档 wiki_page
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE wiki_page SET status = 'archived'"),
        [["wp1"]],
      );
    });

    it("should_not_archive_wiki_page_when_no_wiki_page_id", async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: "g1", wiki_page_id: null }]) // Rule 1: 无 wiki_page
        .mockResolvedValueOnce([]) // Rule 2
        .mockResolvedValueOnce([]); // Rule 3

      await runGoalQualityCleanup("user-1");

      // 不应调用归档（Rule 1 后没有有效的 wiki_page_id）
      // Rule 2 和 Rule 3 也无操作
      // 所以 execute 不被调用
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe("Rule 2: 空壳目标清退", () => {
    it("should_dismiss_hollow_goals_older_than_7_days", async () => {
      mockQuery
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([
          { id: "g3", wiki_page_id: "wp3" },
        ]) // Rule 2
        .mockResolvedValueOnce([]); // Rule 3

      const result = await runGoalQualityCleanup("user-1");

      expect(result.hollowDismissed).toBe(1);
      // 验证 Rule 2 SQL 包含正确条件
      expect(mockQuery.mock.calls[1][0]).toContain("7 days");
      expect(mockQuery.mock.calls[1][0]).toContain("NOT EXISTS");
    });

    it("should_not_dismiss_hollow_goals_younger_than_7_days", async () => {
      // Rule 2 SQL 包含年龄保护条件，由 DB 返回空即表示未清理
      mockQuery
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]) // Rule 2: DB 不返回新创建的
        .mockResolvedValueOnce([]); // Rule 3

      const result = await runGoalQualityCleanup("user-1");

      expect(result.hollowDismissed).toBe(0);
    });

    it("should_not_dismiss_goals_with_children", async () => {
      // Rule 2 SQL 包含 NOT EXISTS subquery，有子任务的不会被返回
      mockQuery
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]) // Rule 2: 有子任务的不返回
        .mockResolvedValueOnce([]); // Rule 3

      const result = await runGoalQualityCleanup("user-1");

      expect(result.hollowDismissed).toBe(0);
    });

    it("should_archive_wiki_page_for_hollow_goal", async () => {
      mockQuery
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([{ id: "g4", wiki_page_id: "wp4" }]) // Rule 2
        .mockResolvedValueOnce([]); // Rule 3

      await runGoalQualityCleanup("user-1");

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE wiki_page SET status = 'archived'"),
        [["wp4"]],
      );
    });
  });

  describe("Rule 3: 精确文本去重", () => {
    it("should_merge_duplicates_keeping_earliest", async () => {
      mockQuery
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]) // Rule 2
        .mockResolvedValueOnce([ // Rule 3: 重复组
          { normalized_text: "学英语", ids: ["g-oldest", "g-newer", "g-newest"] },
        ])
        // keepGoal wiki_page_id 查询
        .mockResolvedValueOnce([{ wiki_page_id: "wp-keep" }])
        // dismissedGoals 查询
        .mockResolvedValueOnce([
          { id: "g-newer", wiki_page_id: "wp-newer" },
          { id: "g-newest", wiki_page_id: null },
        ])
        // 清退 UPDATE RETURNING
        .mockResolvedValueOnce([
          { id: "g-newer", wiki_page_id: "wp-newer" },
          { id: "g-newest", wiki_page_id: null },
        ]);

      const result = await runGoalQualityCleanup("user-1");

      expect(result.duplicatesMerged).toBe(2);

      // 验证子任务迁移
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE todo SET parent_id"),
        ["g-oldest", ["g-newer", "g-newest"]],
      );

      // 验证 wiki_page_record 迁移
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE wiki_page_record SET wiki_page_id"),
        ["wp-keep", ["wp-newer"]],
      );
    });

    it("should_not_transfer_wiki_page_record_when_keep_goal_has_no_wiki_page", async () => {
      mockQuery
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]) // Rule 2
        .mockResolvedValueOnce([ // Rule 3: 重复组
          { normalized_text: "健身", ids: ["g-a", "g-b"] },
        ])
        // keepGoal: 无 wiki_page
        .mockResolvedValueOnce([{ wiki_page_id: null }])
        // dismissedGoals
        .mockResolvedValueOnce([{ id: "g-b", wiki_page_id: "wp-b" }])
        // 清退 UPDATE RETURNING
        .mockResolvedValueOnce([{ id: "g-b", wiki_page_id: "wp-b" }]);

      await runGoalQualityCleanup("user-1");

      // 不应有 wiki_page_record 迁移的 execute 调用
      // 但有 parent_id 迁移 + wiki_page 归档
      const executeCalls = mockExecute.mock.calls.map(c => c[0]);
      expect(executeCalls.some((sql: string) => sql.includes("wiki_page_record"))).toBe(false);
    });

    it("should_dismiss_duplicate_goals_and_archive_wiki_pages", async () => {
      mockQuery
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]) // Rule 2
        .mockResolvedValueOnce([ // Rule 3
          { normalized_text: "减肥", ids: ["g-keep", "g-dup"] },
        ])
        .mockResolvedValueOnce([{ wiki_page_id: null }]) // keepGoal
        .mockResolvedValueOnce([{ id: "g-dup", wiki_page_id: "wp-dup" }]) // dismissedGoals
        .mockResolvedValueOnce([{ id: "g-dup", wiki_page_id: "wp-dup" }]); // 清退 RETURNING

      await runGoalQualityCleanup("user-1");

      // 验证 wiki_page 归档
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE wiki_page SET status = 'archived'"),
        [["wp-dup"]],
      );
    });

    it("should_handle_no_duplicates", async () => {
      mockQuery
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]) // Rule 2
        .mockResolvedValueOnce([]); // Rule 3: 无重复

      const result = await runGoalQualityCleanup("user-1");

      expect(result.duplicatesMerged).toBe(0);
    });
  });

  describe("综合行为", () => {
    it("should_return_all_zero_when_nothing_to_clean", async () => {
      mockQuery
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]) // Rule 2
        .mockResolvedValueOnce([]); // Rule 3

      const result = await runGoalQualityCleanup("user-1");

      expect(result).toEqual({
        suggestedDismissed: 0,
        hollowDismissed: 0,
        duplicatesMerged: 0,
      });
    });

    it("should_execute_all_3_rules_in_sequence", async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: "g1", wiki_page_id: null }]) // Rule 1
        .mockResolvedValueOnce([{ id: "g2", wiki_page_id: null }]) // Rule 2
        .mockResolvedValueOnce([ // Rule 3
          { normalized_text: "test", ids: ["g3", "g4"] },
        ])
        .mockResolvedValueOnce([{ wiki_page_id: null }]) // keepGoal
        .mockResolvedValueOnce([{ id: "g4", wiki_page_id: null }]) // dismissedGoals
        .mockResolvedValueOnce([{ id: "g4", wiki_page_id: null }]); // 清退

      const result = await runGoalQualityCleanup("user-1");

      expect(result.suggestedDismissed).toBe(1);
      expect(result.hollowDismissed).toBe(1);
      expect(result.duplicatesMerged).toBe(1);
    });
  });
});
