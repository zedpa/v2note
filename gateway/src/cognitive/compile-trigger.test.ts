/**
 * 编译阈值触发 单元测试 — Phase 14.5
 *
 * 覆盖场景：
 * - token_count >= 5000 时触发编译
 * - token_count < 5000 时不触发
 * - 编译以 fire-and-forget 方式执行
 * - 编译完成后 token_count 重置为 0
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 外部依赖 ──

vi.mock("../db/repositories/wiki-page.js", () => ({
  findById: vi.fn(),
  update: vi.fn(),
  decrementTokenCount: vi.fn(),
}));

vi.mock("./wiki-compiler.js", () => ({
  compileWikiForUser: vi.fn(),
}));

// ── 导入 ──

import { checkAndTriggerCompile } from "./compile-trigger.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import { compileWikiForUser } from "./wiki-compiler.js";

const mockFindById = vi.mocked(wikiPageRepo.findById);
const mockUpdate = vi.mocked(wikiPageRepo.update);
const mockDecrementTokenCount = vi.mocked(wikiPageRepo.decrementTokenCount);
const mockCompile = vi.mocked(compileWikiForUser);

// ── 工厂函数 ──

function makePage(overrides: Partial<{ id: string; token_count: number }> = {}) {
  return {
    id: overrides.id ?? "wp-1",
    user_id: "u-1",
    title: "测试页面",
    content: "",
    summary: null,
    parent_id: null,
    level: 3,
    status: "active" as const,
    merged_into: null,
    domain: null,
    page_type: "topic" as const,
    token_count: overrides.token_count ?? 0,
    created_by: "ai" as const,
    embedding: null,
    metadata: {},
    compiled_at: null,
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-10T10:00:00Z",
  };
}

// ── 测试 ──

describe("compile-trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompile.mockResolvedValue({
      pages_created: 0,
      pages_updated: 1,
      pages_split: 0,
      pages_merged: 0,
      records_compiled: 5,
    });
    mockUpdate.mockResolvedValue(undefined);
    mockDecrementTokenCount.mockResolvedValue(undefined);
  });

  describe("checkAndTriggerCompile", () => {
    it("should_trigger_compile_when_token_count_gte_5000", async () => {
      mockFindById.mockResolvedValue(makePage({ id: "wp-1", token_count: 5000 }) as any);

      await checkAndTriggerCompile("wp-1", "u-1");

      expect(mockCompile).toHaveBeenCalledWith("u-1");
    });

    it("should_not_trigger_compile_when_token_count_lt_5000", async () => {
      mockFindById.mockResolvedValue(makePage({ id: "wp-1", token_count: 4999 }) as any);

      await checkAndTriggerCompile("wp-1", "u-1");

      expect(mockCompile).not.toHaveBeenCalled();
    });

    it("should_trigger_compile_when_token_count_exceeds_5000", async () => {
      mockFindById.mockResolvedValue(makePage({ id: "wp-1", token_count: 8000 }) as any);

      await checkAndTriggerCompile("wp-1", "u-1");

      expect(mockCompile).toHaveBeenCalledWith("u-1");
    });

    it("should_decrement_token_count_after_compile", async () => {
      mockFindById.mockResolvedValue(makePage({ id: "wp-1", token_count: 6000 }) as any);

      await checkAndTriggerCompile("wp-1", "u-1");

      // 减去编译前的 token_count（而非归零），保留编译期间新增的 token
      expect(mockDecrementTokenCount).toHaveBeenCalledWith("wp-1", 6000);
    });

    it("should_not_decrement_token_count_when_below_threshold", async () => {
      mockFindById.mockResolvedValue(makePage({ id: "wp-1", token_count: 3000 }) as any);

      await checkAndTriggerCompile("wp-1", "u-1");

      expect(mockDecrementTokenCount).not.toHaveBeenCalled();
    });

    it("should_not_crash_when_page_not_found", async () => {
      mockFindById.mockResolvedValue(null);

      // 不应抛错
      await expect(checkAndTriggerCompile("wp-missing", "u-1")).resolves.not.toThrow();
      expect(mockCompile).not.toHaveBeenCalled();
    });

    it("should_not_crash_when_compile_fails", async () => {
      mockFindById.mockResolvedValue(makePage({ id: "wp-1", token_count: 5000 }) as any);
      mockCompile.mockRejectedValue(new Error("compile failed"));

      // fire-and-forget 不应让错误传播
      await expect(checkAndTriggerCompile("wp-1", "u-1")).resolves.not.toThrow();
    });
  });
});
