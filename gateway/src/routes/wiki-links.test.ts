/**
 * Wiki links 路由 单元测试 — Phase 14.11
 *
 * 覆盖场景：GET /api/v1/wiki/pages/:id/links 返回关联链接
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/repositories/wiki-page-link.js", () => ({
  findByPage: vi.fn(),
}));

import { findByPage } from "../db/repositories/wiki-page-link.js";

const mockFindByPage = vi.mocked(findByPage);

describe("wiki links route (Phase 14.11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_return_links_when_findByPage_returns_results", async () => {
    const mockLinks = [
      {
        id: "link-1",
        source_page_id: "wp-1",
        target_page_id: "wp-2",
        link_type: "reference" as const,
        context_text: "与采购相关",
        created_at: "2026-04-11T10:00:00Z",
      },
    ];
    mockFindByPage.mockResolvedValue(mockLinks);

    const result = await findByPage("wp-1");

    expect(result).toHaveLength(1);
    expect(result[0].link_type).toBe("reference");
    expect(mockFindByPage).toHaveBeenCalledWith("wp-1");
  });

  it("should_return_empty_array_when_no_links_exist", async () => {
    mockFindByPage.mockResolvedValue([]);

    const result = await findByPage("wp-no-links");

    expect(result).toEqual([]);
  });
});
