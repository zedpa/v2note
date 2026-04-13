/**
 * 轻量 AI 分类器 单元测试 — Phase 14.4
 *
 * 覆盖 spec 14.4 的场景：
 * - 异步轻量分类将无 @路由的 Record 归属到 wiki page
 * - 匹配已有 L3/L2 page 或创建新 page
 * - token 预算控制
 * - 失败静默降级
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 外部依赖 ──

vi.mock("../ai/provider.js", () => ({
  generateStructured: vi.fn(),
}));

vi.mock("../db/repositories/wiki-page.js", () => ({
  findAllActive: vi.fn(),
  findRoots: vi.fn(),
  findByParent: vi.fn(),
  create: vi.fn(),
  incrementTokenCount: vi.fn(),
}));

vi.mock("../db/repositories/wiki-page-record.js", () => ({
  link: vi.fn(),
  findPagesByRecord: vi.fn(),
}));

vi.mock("../db/repositories/index.js", () => ({
  recordRepo: {
    mergeMetadata: vi.fn(),
  },
}));

vi.mock("./compile-trigger.js", () => ({
  checkAndTriggerCompile: vi.fn().mockResolvedValue(undefined),
}));

// ── 导入 ──

import {
  classifyRecord,
  resolvePageFromClassification,
  estimateTokens,
  truncateText,
  buildPageList,
} from "./lightweight-classifier.js";
import { generateStructured } from "../ai/provider.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../db/repositories/wiki-page-record.js";
import { recordRepo } from "../db/repositories/index.js";

const mockGenerateStructured = vi.mocked(generateStructured);
const mockFindAllActive = vi.mocked(wikiPageRepo.findAllActive);
const mockCreate = vi.mocked(wikiPageRepo.create);
const mockIncrementTokenCount = vi.mocked(wikiPageRepo.incrementTokenCount);
const mockLink = vi.mocked(wikiPageRecordRepo.link);
const mockFindPagesByRecord = vi.mocked(wikiPageRecordRepo.findPagesByRecord);
const mockMergeMetadata = vi.mocked(recordRepo.mergeMetadata);

// ── 工厂函数 ──

function makePage(overrides: Partial<{
  id: string; title: string; level: number; parent_id: string | null;
  user_id: string; created_by: "ai" | "user";
}> = {}) {
  return {
    id: overrides.id ?? "wp-1",
    user_id: overrides.user_id ?? "u-1",
    title: overrides.title ?? "工作",
    content: "",
    summary: null,
    parent_id: overrides.parent_id ?? null,
    level: overrides.level ?? 3,
    status: "active" as const,
    merged_into: null,
    page_type: "topic" as const,
    token_count: 0,
    created_by: overrides.created_by ?? "user",
    embedding: null,
    metadata: {},
    compiled_at: null,
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-10T10:00:00Z",
  };
}

// ── 测试 ──

describe("lightweight-classifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIncrementTokenCount.mockResolvedValue(0);
    mockLink.mockResolvedValue(undefined);
    mockFindPagesByRecord.mockResolvedValue([]);
    mockMergeMetadata.mockResolvedValue(undefined);
  });

  // ── estimateTokens ──

  describe("estimateTokens", () => {
    it("should_estimate_chinese_text_as_2_tokens_per_char", () => {
      const result = estimateTokens("今天天气真好");
      // 6 个中文字 × 2 = 12
      expect(result).toBe(12);
    });

    it("should_estimate_english_text_with_lower_ratio", () => {
      const result = estimateTokens("hello world");
      // "hello" = 5 × 0.25 = 1.25, " " = 0.3, "world" = 5 × 0.25 = 1.25 → ~3
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10);
    });

    it("should_return_at_least_1_for_empty_string", () => {
      expect(estimateTokens("")).toBe(1);
    });

    it("should_handle_mixed_chinese_english_text", () => {
      const result = estimateTokens("今天学习React");
      // 4 中文 × 2 + 5 ASCII × 0.25 = 8 + 1.25 = ~9
      expect(result).toBeGreaterThan(5);
    });
  });

  // ── truncateText ──

  describe("truncateText", () => {
    it("should_return_original_text_when_under_limit", () => {
      expect(truncateText("短文本", 200)).toBe("短文本");
    });

    it("should_truncate_text_when_over_limit", () => {
      const longText = "a".repeat(300);
      const result = truncateText(longText, 200);
      expect(result.length).toBe(200);
    });

    it("should_use_default_200_char_limit", () => {
      const longText = "字".repeat(250);
      const result = truncateText(longText);
      expect(result.length).toBe(200);
    });
  });

  // ── buildPageList ──

  describe("buildPageList", () => {
    it("should_return_empty_hint_when_no_pages", () => {
      expect(buildPageList([])).toContain("暂无");
    });

    it("should_list_l3_pages_with_l2_children", () => {
      const pages = [
        { id: "l3-1", title: "工作", level: 3, parent_id: null },
        { id: "l2-1", title: "采购", level: 2, parent_id: "l3-1" },
      ];
      const result = buildPageList(pages);
      expect(result).toContain("工作");
      expect(result).toContain("工作/采购");
    });

    it("should_handle_l3_without_children", () => {
      const pages = [
        { id: "l3-1", title: "学习", level: 3, parent_id: null },
      ];
      const result = buildPageList(pages);
      expect(result).toContain("学习");
    });
  });

  // ── resolvePageFromClassification ──

  describe("resolvePageFromClassification", () => {
    it("should_return_existing_l3_page_id_when_domain_matches", async () => {
      const pages = [makePage({ id: "wp-work", title: "工作", level: 3 })];

      const result = await resolvePageFromClassification(
        "u-1",
        { domain_title: "工作" },
        pages,
      );
      expect(result).toBe("wp-work");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should_return_existing_l2_page_id_when_page_title_matches", async () => {
      const l3 = makePage({ id: "wp-work", title: "工作", level: 3 });
      const l2 = makePage({ id: "wp-buy", title: "采购", level: 2, parent_id: "wp-work" });

      const result = await resolvePageFromClassification(
        "u-1",
        { domain_title: "工作", page_title: "采购" },
        [l3, l2],
      );
      expect(result).toBe("wp-buy");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should_create_new_l3_page_when_domain_not_found", async () => {
      mockCreate.mockResolvedValue(makePage({ id: "wp-new", title: "健康", created_by: "ai" }) as any);

      const result = await resolvePageFromClassification(
        "u-1",
        { domain_title: "健康" },
        [], // 没有已有 page
      );
      expect(result).toBe("wp-new");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "u-1",
          title: "健康",
          level: 3,
          created_by: "ai",
        }),
      );
      // domain 已废弃，不应传入
      expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("domain");
    });

    it("should_create_l2_under_existing_l3_when_page_title_new", async () => {
      const l3 = makePage({ id: "wp-work", title: "工作", level: 3 });
      mockCreate.mockResolvedValue(makePage({ id: "wp-new-l2", title: "财务", level: 2, parent_id: "wp-work" }) as any);

      const result = await resolvePageFromClassification(
        "u-1",
        { domain_title: "工作", page_title: "财务" },
        [l3],
      );
      expect(result).toBe("wp-new-l2");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "财务",
          level: 2,
          parent_id: "wp-work",
          created_by: "ai",
        }),
      );
      // domain 已废弃，不应传入
      expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("domain");
    });

    it("should_create_both_l3_and_l2_when_both_new", async () => {
      const newL3 = makePage({ id: "wp-new-l3", title: "投资", level: 3, created_by: "ai" });
      const newL2 = makePage({ id: "wp-new-l2", title: "股票", level: 2, parent_id: "wp-new-l3", created_by: "ai" });
      mockCreate
        .mockResolvedValueOnce(newL3 as any) // L3 创建
        .mockResolvedValueOnce(newL2 as any); // L2 创建

      const result = await resolvePageFromClassification(
        "u-1",
        { domain_title: "投资", page_title: "股票" },
        [],
      );
      expect(result).toBe("wp-new-l2");
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  // ── classifyRecord 完整流程 ──

  describe("classifyRecord", () => {
    it("should_classify_and_link_record_to_existing_l3_page", async () => {
      const existingPage = makePage({ id: "wp-work", title: "工作", level: 3 });
      mockFindAllActive.mockResolvedValue([existingPage] as any);
      mockGenerateStructured.mockResolvedValue({
        object: { domain_title: "工作" },
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      } as any);

      await classifyRecord("rec-1", "今天和张总讨论了采购方案", "u-1");

      // 应使用 fast tier 调用 AI
      expect(mockGenerateStructured).toHaveBeenCalledWith(
        expect.any(Array),
        expect.anything(),
        expect.objectContaining({ tier: "fast" }),
      );
      // 应建立关联
      expect(mockLink).toHaveBeenCalledWith("wp-work", "rec-1");
      // 应更新 token_count
      expect(mockIncrementTokenCount).toHaveBeenCalledWith("wp-work", expect.any(Number));
      // 应写入 metadata
      expect(mockMergeMetadata).toHaveBeenCalledWith("rec-1", { classified_path: "工作" });
    });

    it("should_classify_and_link_to_l2_when_page_title_provided", async () => {
      const l3 = makePage({ id: "wp-work", title: "工作", level: 3 });
      const l2 = makePage({ id: "wp-buy", title: "采购", level: 2, parent_id: "wp-work" });
      mockFindAllActive.mockResolvedValue([l3, l2] as any);
      mockGenerateStructured.mockResolvedValue({
        object: { domain_title: "工作", page_title: "采购" },
      } as any);

      await classifyRecord("rec-2", "采购报价单审批", "u-1");

      expect(mockLink).toHaveBeenCalledWith("wp-buy", "rec-2");
      expect(mockMergeMetadata).toHaveBeenCalledWith("rec-2", { classified_path: "工作/采购" });
    });

    it("should_create_new_l3_page_with_ai_created_by_when_domain_new", async () => {
      mockFindAllActive.mockResolvedValue([]);
      const newPage = makePage({ id: "wp-health", title: "健康", created_by: "ai" });
      mockCreate.mockResolvedValue(newPage as any);
      mockGenerateStructured.mockResolvedValue({
        object: { domain_title: "健康" },
      } as any);

      await classifyRecord("rec-3", "今天跑步5公里", "u-1");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: "ai",
          title: "健康",
          level: 3,
        }),
      );
      expect(mockLink).toHaveBeenCalledWith("wp-health", "rec-3");
    });

    it("should_truncate_text_to_200_chars_before_sending_to_ai", async () => {
      const longText = "这是一段很长的日记内容".repeat(50); // 远超 200 字
      mockFindAllActive.mockResolvedValue([]);
      const newPage = makePage({ id: "wp-new", title: "日常" });
      mockCreate.mockResolvedValue(newPage as any);
      mockGenerateStructured.mockResolvedValue({
        object: { domain_title: "日常" },
      } as any);

      await classifyRecord("rec-long", longText, "u-1");

      // 验证发给 AI 的文本被截断
      const aiMessages = mockGenerateStructured.mock.calls[0][0] as Array<{ content: string }>;
      const userMessage = aiMessages.find(m => m.content !== undefined && !m.content.startsWith("你是"));
      expect(userMessage!.content.length).toBeLessThanOrEqual(200);
    });

    it("should_update_token_count_after_classification", async () => {
      const page = makePage({ id: "wp-1", title: "工作", level: 3 });
      mockFindAllActive.mockResolvedValue([page] as any);
      mockGenerateStructured.mockResolvedValue({
        object: { domain_title: "工作" },
      } as any);

      const text = "中文测试文本"; // 6 个中文字 ≈ 12 tokens
      await classifyRecord("rec-tc", text, "u-1");

      expect(mockIncrementTokenCount).toHaveBeenCalledWith("wp-1", expect.any(Number));
      // token 数应大于 0
      const tokenDelta = mockIncrementTokenCount.mock.calls[0][1];
      expect(tokenDelta).toBeGreaterThan(0);
    });

    it("should_write_classified_path_to_record_metadata", async () => {
      const page = makePage({ id: "wp-1", title: "学习", level: 3 });
      mockFindAllActive.mockResolvedValue([page] as any);
      mockGenerateStructured.mockResolvedValue({
        object: { domain_title: "学习", page_title: "编程" },
      } as any);
      mockCreate.mockResolvedValue(makePage({ id: "wp-l2", title: "编程", level: 2 }) as any);

      await classifyRecord("rec-meta", "今天学了 TypeScript", "u-1");

      expect(mockMergeMetadata).toHaveBeenCalledWith("rec-meta", {
        classified_path: "学习/编程",
      });
    });

    it("should_propagate_error_when_ai_call_fails", async () => {
      mockFindAllActive.mockResolvedValue([]);
      mockGenerateStructured.mockRejectedValue(new Error("AI timeout"));

      // classifyRecord 本身会抛错，由调用方（digest.ts）的 .catch() 捕获
      await expect(classifyRecord("rec-fail", "内容", "u-1")).rejects.toThrow("AI timeout");

      // 不应建立关联
      expect(mockLink).not.toHaveBeenCalled();
    });

    it("should_include_existing_pages_in_prompt", async () => {
      const pages = [
        makePage({ id: "wp-1", title: "工作", level: 3 }),
        makePage({ id: "wp-2", title: "学习", level: 3 }),
      ];
      mockFindAllActive.mockResolvedValue(pages as any);
      mockGenerateStructured.mockResolvedValue({
        object: { domain_title: "工作" },
      } as any);

      await classifyRecord("rec-ctx", "讨论方案", "u-1");

      const messages = mockGenerateStructured.mock.calls[0][0] as Array<{ content: string }>;
      const systemMsg = messages.find(m => m.content.includes("分类助手"));
      expect(systemMsg).toBeDefined();
      expect(systemMsg!.content).toContain("工作");
      expect(systemMsg!.content).toContain("学习");
    });

    // 场景 4.1: process.ts 已归类 → lightweight-classifier 跳过（不重复计数）
    it("should_skip_classification_when_record_already_linked", async () => {
      mockFindPagesByRecord.mockResolvedValue([
        { wiki_page_id: "wp-existing", record_id: "rec-linked", added_at: "2026-04-13T00:00:00Z" },
      ]);

      await classifyRecord("rec-linked", "一些内容", "u-1");

      // 不应调用 AI
      expect(mockGenerateStructured).not.toHaveBeenCalled();
      // 不应创建新 page
      expect(mockCreate).not.toHaveBeenCalled();
      // 不应创建新 link
      expect(mockLink).not.toHaveBeenCalled();
      // 不应更新 token_count（process.ts 已做，避免双重计数）
      expect(mockIncrementTokenCount).not.toHaveBeenCalled();
      // 不应写入 metadata
      expect(mockMergeMetadata).not.toHaveBeenCalled();
    });

    // 场景 4.1 补充: record 无关联 → 正常分类
    it("should_classify_normally_when_record_has_no_links", async () => {
      mockFindPagesByRecord.mockResolvedValue([]);
      const page = makePage({ id: "wp-1", title: "工作", level: 3 });
      mockFindAllActive.mockResolvedValue([page] as any);
      mockGenerateStructured.mockResolvedValue({
        object: { domain_title: "工作" },
      } as any);

      await classifyRecord("rec-new", "今天和张总讨论了采购方案", "u-1");

      // 应调用 AI
      expect(mockGenerateStructured).toHaveBeenCalled();
      // 应建立关联
      expect(mockLink).toHaveBeenCalledWith("wp-1", "rec-new");
    });
  });
});
