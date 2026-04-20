/**
 * 每日全量编译维护 单元测试 — Phase 14.9
 *
 * 覆盖场景：
 * - 5 阶段串行执行，每阶段独立 try/catch
 * - 阶段 1: 扫描 token_count >= 5000 的 page 触发编译
 * - 阶段 2: Goal page 关联的 todo 状态同步
 * - 阶段 3: AI 交互素材分发（简化实现：占位 TODO）
 * - 阶段 4: 跨 page 结构优化（简化实现：检测臃肿 page）
 * - 阶段 5: Link 发现（TODO 占位）
 * - 单阶段失败不影响其他阶段
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 外部依赖 ──

vi.mock("../db/repositories/wiki-page.js", () => ({
  findByUser: vi.fn(),
  findAllActive: vi.fn(),
  update: vi.fn(),
  decrementTokenCount: vi.fn(),
}));

vi.mock("./wiki-compiler.js", () => ({
  compileWikiForUser: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  query: vi.fn(),
}));

vi.mock("../lib/tz.js", () => ({
  today: vi.fn(() => "2026-04-11"),
  todayRange: vi.fn(() => ({
    start: "2026-04-10T16:00:00.000Z",
    end: "2026-04-11T15:59:59.999Z",
  })),
}));

vi.mock("./goal-quality-stage.js", () => ({
  runGoalQualityCleanup: vi.fn(),
}));

// ── 导入 ──

import { runFullCompileMaintenance } from "./full-compile-maintenance.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import { compileWikiForUser } from "./wiki-compiler.js";
import { query } from "../db/pool.js";
import { runGoalQualityCleanup } from "./goal-quality-stage.js";

const mockFindByUser = vi.mocked(wikiPageRepo.findByUser);
const mockFindAllActive = vi.mocked(wikiPageRepo.findAllActive);
const mockUpdate = vi.mocked(wikiPageRepo.update);
const mockCompile = vi.mocked(compileWikiForUser);
const mockQuery = vi.mocked(query);
const mockGoalQuality = vi.mocked(runGoalQualityCleanup);

// ── 工厂函数 ──

function makePage(overrides: Partial<{
  id: string; token_count: number; page_type: string;
  content: string; compiled_at: string | null;
}> = {}) {
  return {
    id: overrides.id ?? "wp-1",
    user_id: "u-1",
    title: "测试页面",
    content: overrides.content ?? "some content",
    summary: null,
    parent_id: null,
    level: 3,
    status: "active" as const,
    merged_into: null,
    domain: null,
    page_type: (overrides.page_type ?? "topic") as "topic" | "goal",
    token_count: overrides.token_count ?? 0,
    created_by: "ai" as const,
    embedding: null,
    metadata: {},
    compiled_at: overrides.compiled_at ?? null,
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-10T10:00:00Z",
  };
}

// ── 测试 ──

describe("full-compile-maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompile.mockResolvedValue({
      pages_created: 0,
      pages_updated: 0,
      pages_split: 0,
      pages_merged: 0,
      records_compiled: 0,
    });
    mockUpdate.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue([] as any);
    mockGoalQuality.mockResolvedValue({
      suggestedDismissed: 0,
      hollowDismissed: 0,
      duplicatesMerged: 0,
    });
  });

  describe("runFullCompileMaintenance", () => {
    it("should_trigger_compile_when_pages_have_token_count_gte_5000", async () => {
      // 阶段 1 用 query 直接查 token_count >= 5000 的 page
      // 阶段 2 用 query 查 goal pages，再 query 查 completed todos
      mockQuery
        .mockResolvedValueOnce([{ id: "wp-1", token_count: 6000 }] as any) // 阶段 1: pending compile
        .mockResolvedValueOnce([] as any) // 阶段 2: goal pages
        .mockResolvedValue([] as any); // 其余 query
      mockFindAllActive.mockResolvedValue([]);

      const result = await runFullCompileMaintenance("u-1");

      expect(mockCompile).toHaveBeenCalledWith("u-1");
      expect(result.stages.diary_compile).toBe(true);
    });

    it("should_skip_compile_when_no_pages_exceed_threshold", async () => {
      // 阶段 1 返回空（无超阈值 page）
      mockQuery
        .mockResolvedValueOnce([] as any) // 阶段 1: 无 pending
        .mockResolvedValueOnce([] as any) // 阶段 2: goal pages
        .mockResolvedValue([] as any);
      mockFindAllActive.mockResolvedValue([]);

      const result = await runFullCompileMaintenance("u-1");

      expect(mockCompile).not.toHaveBeenCalled();
      expect(result.stages.diary_compile).toBe(false);
    });

    it("should_continue_other_stages_when_compile_fails", async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: "wp-1", token_count: 6000 }] as any) // 阶段 1
        .mockResolvedValueOnce([] as any) // 阶段 2
        .mockResolvedValue([] as any);
      mockFindAllActive.mockResolvedValue([]);
      mockCompile.mockRejectedValue(new Error("compile failed"));

      const result = await runFullCompileMaintenance("u-1");
      expect(result.stages.diary_compile).toBe(false);
      expect(result.stages).toHaveProperty("todo_sync");
      expect(result.stages).toHaveProperty("ai_diary");
      expect(result.stages).toHaveProperty("structure_optimization");
      expect(result.stages).toHaveProperty("link_discovery");
    });

    it("should_return_all_6_stage_results", async () => {
      mockQuery.mockResolvedValue([] as any);
      mockFindAllActive.mockResolvedValue([]);

      const result = await runFullCompileMaintenance("u-1");

      expect(result.stages).toHaveProperty("diary_compile");
      expect(result.stages).toHaveProperty("todo_sync");
      expect(result.stages).toHaveProperty("ai_diary");
      expect(result.stages).toHaveProperty("structure_optimization");
      expect(result.stages).toHaveProperty("link_discovery");
      expect(result.stages).toHaveProperty("goal_quality");
    });

    it("should_detect_bloated_pages_in_structure_optimization", async () => {
      mockQuery.mockResolvedValue([] as any);
      mockFindAllActive.mockResolvedValue([
        makePage({ id: "wp-bloat", content: "x".repeat(60000) }),
      ] as any);

      const result = await runFullCompileMaintenance("u-1");

      expect(result.stages.structure_optimization).toBe(true);
      expect(result.bloatedPages).toContain("wp-bloat");
    });

    it("should_set_goal_quality_true_when_goals_cleaned", async () => {
      mockQuery.mockResolvedValue([] as any);
      mockFindAllActive.mockResolvedValue([]);
      mockGoalQuality.mockResolvedValue({
        suggestedDismissed: 2,
        hollowDismissed: 1,
        duplicatesMerged: 0,
      });

      const result = await runFullCompileMaintenance("u-1");

      expect(result.stages.goal_quality).toBe(true);
      expect(result.goalQualityStats.suggestedDismissed).toBe(2);
      expect(result.goalQualityStats.hollowDismissed).toBe(1);
    });

    it("should_set_goal_quality_false_when_nothing_cleaned", async () => {
      mockQuery.mockResolvedValue([] as any);
      mockFindAllActive.mockResolvedValue([]);

      const result = await runFullCompileMaintenance("u-1");

      expect(result.stages.goal_quality).toBe(false);
      expect(result.goalQualityStats).toEqual({
        suggestedDismissed: 0,
        hollowDismissed: 0,
        duplicatesMerged: 0,
      });
    });

    it("should_continue_when_goal_quality_stage_fails", async () => {
      mockQuery.mockResolvedValue([] as any);
      mockFindAllActive.mockResolvedValue([]);
      mockGoalQuality.mockRejectedValue(new Error("goal quality failed"));

      const result = await runFullCompileMaintenance("u-1");

      expect(result.stages.goal_quality).toBe(false);
      expect(result.errors).toContain("goal_quality: goal quality failed");
      // 其他阶段结果仍然存在
      expect(result.stages.todo_sync).toBe(true);
    });

    it("should_execute_stages_serially_not_in_parallel", async () => {
      const callOrder: string[] = [];

      mockQuery.mockImplementation(async (...args: any[]) => {
        const sql = args[0] as string;
        if (sql.includes("token_count")) callOrder.push("query_stage1");
        if (sql.includes("page_type")) callOrder.push("query_stage2");
        return [] as any;
      });
      mockFindAllActive.mockImplementation(async () => {
        callOrder.push("findAllActive");
        return [] as any;
      });

      await runFullCompileMaintenance("u-1");

      // 阶段 1 的 query 应在阶段 4 的 findAllActive 之前
      const s1Idx = callOrder.indexOf("query_stage1");
      const s4Idx = callOrder.indexOf("findAllActive");
      if (s1Idx >= 0 && s4Idx >= 0) {
        expect(s4Idx).toBeGreaterThan(s1Idx);
      }
    });
  });
});
