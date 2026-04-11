/**
 * @路由语法解析器 单元测试
 *
 * 覆盖 spec 14.3 的场景：解析 @domain/subdomain 语法，
 * 提取 target_path，自动创建不存在的 page，建立关联。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/repositories/wiki-page.js", () => ({
  findRoots: vi.fn(),
  findByParent: vi.fn(),
  create: vi.fn(),
}));

vi.mock("../db/repositories/wiki-page-record.js", () => ({
  link: vi.fn(),
}));

import { parseAtRoute, ensurePagePath, processAtRoute } from "./at-route-parser.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../db/repositories/wiki-page-record.js";

describe("at-route-parser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── parseAtRoute: 正则提取 ──

  describe("parseAtRoute", () => {
    it("should_extract_single_chinese_domain_when_text_contains_at_route", () => {
      const result = parseAtRoute("今天 @工作 讨论了采购");
      expect(result).toBe("工作");
    });

    it("should_extract_domain_with_subdomain_when_slash_present", () => {
      const result = parseAtRoute("@工作/采购 今天的报价单");
      expect(result).toBe("工作/采购");
    });

    it("should_extract_english_domain_when_text_contains_english_at_route", () => {
      const result = parseAtRoute("@React/hooks 学习笔记");
      expect(result).toBe("React/hooks");
    });

    it("should_return_first_match_when_multiple_at_routes_exist", () => {
      const result = parseAtRoute("@工作 还有 @学习 的内容");
      expect(result).toBe("工作");
    });

    it("should_return_null_when_no_at_route_in_text", () => {
      const result = parseAtRoute("普通日记内容没有路由");
      expect(result).toBeNull();
    });

    it("should_return_null_when_text_is_empty", () => {
      const result = parseAtRoute("");
      expect(result).toBeNull();
    });

    it("should_handle_at_route_with_underscores", () => {
      const result = parseAtRoute("@工作/supply_chain 供应链");
      expect(result).toBe("工作/supply_chain");
    });

    it("should_handle_at_route_with_numbers", () => {
      const result = parseAtRoute("@Q2计划 季度目标");
      expect(result).toBe("Q2计划");
    });

    it("should_match_partial_email_as_route_when_at_sign_present", () => {
      // 邮箱地址中的 @ 会被正则匹配到 @ 后的合法字符
      // "user@example.com" → 匹配 "example"（. 不在正则范围内所以 .com 被截断）
      const result = parseAtRoute("联系 user@example.com 这个邮箱");
      expect(result).toBe("example");
    });
  });

  // ── ensurePagePath: 确保页面路径存在 ──

  describe("ensurePagePath", () => {
    const mockL3Page = {
      id: "wp-l3",
      user_id: "u-1",
      title: "工作",
      content: "",
      summary: null,
      parent_id: null,
      level: 3,
      status: "active" as const,
      merged_into: null,
      domain: "工作",
      created_by: "user" as const,
      page_type: "topic" as const,
      token_count: 0,
      embedding: null,
      metadata: {},
      compiled_at: null,
      created_at: "2026-04-09T10:00:00Z",
      updated_at: "2026-04-09T10:00:00Z",
    };

    const mockL2Page = {
      ...mockL3Page,
      id: "wp-l2",
      title: "采购",
      parent_id: "wp-l3",
      level: 2,
      domain: "工作",
    };

    it("should_return_existing_l3_page_when_domain_exists", async () => {
      vi.mocked(wikiPageRepo.findRoots).mockResolvedValue([mockL3Page] as any);

      const result = await ensurePagePath("u-1", "工作");
      expect(result.id).toBe("wp-l3");
      expect(wikiPageRepo.create).not.toHaveBeenCalled();
    });

    it("should_create_l3_page_when_domain_not_exists", async () => {
      vi.mocked(wikiPageRepo.findRoots).mockResolvedValue([]);
      vi.mocked(wikiPageRepo.create).mockResolvedValue(mockL3Page as any);

      const result = await ensurePagePath("u-1", "工作");
      expect(wikiPageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "u-1",
          title: "工作",
          level: 3,
          domain: "工作",
          created_by: "user",
        }),
      );
      expect(result.id).toBe("wp-l3");
    });

    it("should_return_existing_l2_page_when_domain_and_subdomain_exist", async () => {
      vi.mocked(wikiPageRepo.findRoots).mockResolvedValue([mockL3Page] as any);
      vi.mocked(wikiPageRepo.findByParent).mockResolvedValue([mockL2Page] as any);

      const result = await ensurePagePath("u-1", "工作/采购");
      expect(result.id).toBe("wp-l2");
      expect(wikiPageRepo.create).not.toHaveBeenCalled();
    });

    it("should_create_both_l3_and_l2_when_neither_exists", async () => {
      vi.mocked(wikiPageRepo.findRoots).mockResolvedValue([]);
      vi.mocked(wikiPageRepo.create)
        .mockResolvedValueOnce(mockL3Page as any)  // 创建 L3
        .mockResolvedValueOnce(mockL2Page as any); // 创建 L2
      vi.mocked(wikiPageRepo.findByParent).mockResolvedValue([]);

      const result = await ensurePagePath("u-1", "工作/采购");
      expect(wikiPageRepo.create).toHaveBeenCalledTimes(2);
      // 第一次创建 L3
      expect(vi.mocked(wikiPageRepo.create).mock.calls[0][0]).toMatchObject({
        title: "工作",
        level: 3,
        created_by: "user",
      });
      // 第二次创建 L2
      expect(vi.mocked(wikiPageRepo.create).mock.calls[1][0]).toMatchObject({
        title: "采购",
        level: 2,
        parent_id: "wp-l3",
        domain: "工作",
        created_by: "user",
      });
      expect(result.id).toBe("wp-l2");
    });

    it("should_create_l2_under_existing_l3_when_only_subdomain_missing", async () => {
      vi.mocked(wikiPageRepo.findRoots).mockResolvedValue([mockL3Page] as any);
      vi.mocked(wikiPageRepo.findByParent).mockResolvedValue([]);
      vi.mocked(wikiPageRepo.create).mockResolvedValue(mockL2Page as any);

      const result = await ensurePagePath("u-1", "工作/采购");
      expect(wikiPageRepo.create).toHaveBeenCalledTimes(1);
      expect(vi.mocked(wikiPageRepo.create).mock.calls[0][0]).toMatchObject({
        title: "采购",
        level: 2,
        parent_id: "wp-l3",
        domain: "工作",
        created_by: "user",
      });
      expect(result.id).toBe("wp-l2");
    });
  });

  // ── processAtRoute: 完整流程 ──

  describe("processAtRoute", () => {
    const mockPage = {
      id: "wp-target",
      user_id: "u-1",
      title: "工作",
      level: 3,
    };

    it("should_set_target_path_and_link_record_when_at_route_found", async () => {
      vi.mocked(wikiPageRepo.findRoots).mockResolvedValue([mockPage] as any);

      const result = await processAtRoute("u-1", "rec-1", "@工作 今天讨论了采购");
      expect(result).not.toBeNull();
      expect(result!.targetPath).toBe("工作");
      expect(result!.pageId).toBe("wp-target");
      expect(wikiPageRecordRepo.link).toHaveBeenCalledWith("wp-target", "rec-1");
    });

    it("should_return_null_when_no_at_route_in_text", async () => {
      const result = await processAtRoute("u-1", "rec-1", "普通日记内容");
      expect(result).toBeNull();
      expect(wikiPageRecordRepo.link).not.toHaveBeenCalled();
    });

    it("should_create_page_and_link_when_at_route_page_not_exists", async () => {
      vi.mocked(wikiPageRepo.findRoots).mockResolvedValue([]);
      vi.mocked(wikiPageRepo.create).mockResolvedValue(mockPage as any);

      const result = await processAtRoute("u-1", "rec-1", "@工作 新的内容");
      expect(result).not.toBeNull();
      expect(wikiPageRepo.create).toHaveBeenCalled();
      expect(wikiPageRecordRepo.link).toHaveBeenCalledWith("wp-target", "rec-1");
    });
  });
});
