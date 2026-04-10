/**
 * Wiki 搜索单元测试
 *
 * 覆盖场景 4.1（双层搜索）和场景 4.2（Chat 上下文）相关的搜索逻辑
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db pool
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock("../db/pool.js", () => ({
  query: mockQuery,
}));

// Mock embeddings
const { mockGetEmbedding } = vi.hoisted(() => ({ mockGetEmbedding: vi.fn() }));
vi.mock("../memory/embeddings.js", () => ({
  getEmbedding: mockGetEmbedding,
}));

import {
  searchWikiByKeyword,
  searchWikiByVector,
  searchRecordsByKeyword,
  wikiUnifiedSearch,
  extractMatchedSection,
  loadWikiContext,
} from "./wiki-search.js";

describe("wiki-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockGetEmbedding.mockRejectedValue(new Error("not available"));
  });

  // ── Wiki 全文搜索 ──────────────────────────────────────────

  describe("searchWikiByKeyword", () => {
    it("should_return_pages_with_matched_section_when_keyword_matches_content", async () => {
      mockQuery.mockResolvedValue([
        {
          id: "wp1",
          title: "铝价分析",
          content: "第一段内容\n铝价上涨趋势明显\n后续观察\n第四行\n第五行",
          summary: "关于铝价的分析",
        },
      ]);

      const results = await searchWikiByKeyword("铝价", "user1");

      expect(results).toHaveLength(1);
      expect(results[0].page_id).toBe("wp1");
      expect(results[0].title).toBe("铝价分析");
      expect(results[0].summary).toBe("关于铝价的分析");
      // matched_section 应该包含关键字所在行
      expect(results[0].matched_section).toContain("铝价上涨趋势明显");
    });

    it("should_return_empty_array_when_no_keyword_match", async () => {
      mockQuery.mockResolvedValue([]);

      const results = await searchWikiByKeyword("不存在的关键字", "user1");

      expect(results).toEqual([]);
    });

    it("should_query_only_active_wiki_pages", async () => {
      mockQuery.mockResolvedValue([]);

      await searchWikiByKeyword("测试", "user1");

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("status = 'active'");
      expect(sql).toContain("ILIKE");
    });
  });

  // ── Wiki 向量搜索 ──────────────────────────────────────────

  describe("searchWikiByVector", () => {
    it("should_return_pages_ranked_by_similarity_when_embedding_available", async () => {
      mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockQuery.mockResolvedValue([
        {
          id: "wp1",
          title: "铝价分析",
          content: "铝价上涨\n趋势分析",
          summary: "铝价相关",
          similarity: 0.92,
        },
        {
          id: "wp2",
          title: "铜价走势",
          content: "铜价下跌\n市场分析",
          summary: "铜价相关",
          similarity: 0.78,
        },
      ]);

      const results = await searchWikiByVector("铝价走势", "user1");

      expect(results).toHaveLength(2);
      expect(results[0].page_id).toBe("wp1");
      expect(results[1].page_id).toBe("wp2");
      expect(mockGetEmbedding).toHaveBeenCalledWith("铝价走势");
    });

    it("should_return_empty_array_when_embedding_unavailable", async () => {
      mockGetEmbedding.mockRejectedValue(new Error("API key not set"));

      const results = await searchWikiByVector("铝价", "user1");

      expect(results).toEqual([]);
    });
  });

  // ── Record 全文搜索 ──────────────────────────────────────────

  describe("searchRecordsByKeyword", () => {
    it("should_return_records_with_snippet_when_keyword_matches_transcript", async () => {
      mockQuery.mockResolvedValue([
        {
          id: "r1",
          text: "今天和供应商讨论了铝价问题，决定下周再谈",
          created_at: "2026-04-01T10:00:00+08:00",
        },
      ]);

      const results = await searchRecordsByKeyword("铝价", "user1");

      expect(results).toHaveLength(1);
      expect(results[0].record_id).toBe("r1");
      expect(results[0].snippet).toContain("铝价");
      expect(results[0].created_at).toBe("2026-04-01T10:00:00+08:00");
    });

    it("should_return_empty_array_when_no_record_matches", async () => {
      mockQuery.mockResolvedValue([]);

      const results = await searchRecordsByKeyword("不存在的内容", "user1");

      expect(results).toEqual([]);
    });
  });

  // ── 统一搜索 ──────────────────────────────────────────────

  describe("wikiUnifiedSearch", () => {
    it("should_return_dual_layer_structure_with_wiki_and_record_results", async () => {
      // 第一次调用 → wiki 全文搜索结果
      // 第二次调用 → record 全文搜索结果
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("wiki_page")) {
          return Promise.resolve([
            {
              id: "wp1",
              title: "铝价分析",
              content: "铝价上涨趋势明显",
              summary: "铝价相关分析",
            },
          ]);
        }
        if (sql.includes("record")) {
          return Promise.resolve([
            {
              id: "r1",
              text: "今天讨论铝价",
              created_at: "2026-04-01T10:00:00+08:00",
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await wikiUnifiedSearch("铝价", "user1");

      expect(result.wiki_results).toHaveLength(1);
      expect(result.wiki_results[0].page_id).toBe("wp1");
      expect(result.record_results).toHaveLength(1);
      expect(result.record_results[0].record_id).toBe("r1");
    });

    it("should_return_empty_results_when_query_is_empty", async () => {
      const result = await wikiUnifiedSearch("", "user1");

      expect(result.wiki_results).toEqual([]);
      expect(result.record_results).toEqual([]);
    });

    it("should_deduplicate_wiki_results_from_keyword_and_vector_search", async () => {
      // keyword 搜索返回 wp1
      // vector 搜索也返回 wp1
      mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("ILIKE") && sql.includes("wiki_page")) {
          return Promise.resolve([
            {
              id: "wp1",
              title: "铝价分析",
              content: "铝价上涨趋势明显",
              summary: "铝价分析",
            },
          ]);
        }
        if (sql.includes("embedding") && sql.includes("wiki_page")) {
          return Promise.resolve([
            {
              id: "wp1",
              title: "铝价分析",
              content: "铝价上涨趋势明显",
              summary: "铝价分析",
              similarity: 0.9,
            },
          ]);
        }
        if (sql.includes("record")) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const result = await wikiUnifiedSearch("铝价", "user1");

      // 去重后应该只有 1 个 wiki 结果
      expect(result.wiki_results).toHaveLength(1);
    });
  });

  // ── matched_section 提取 ──────────────────────────────────

  describe("extractMatchedSection", () => {
    it("should_extract_lines_around_keyword_match", () => {
      const content = "第一行\n第二行\n关键字在这里\n第四行\n第五行\n第六行";
      const section = extractMatchedSection(content, "关键字");

      expect(section).toContain("关键字在这里");
      // 前后各 2 行
      expect(section).toContain("第一行");
      expect(section).toContain("第二行");
      expect(section).toContain("第四行");
      expect(section).toContain("第五行");
    });

    it("should_handle_keyword_at_start_of_content", () => {
      const content = "关键字在第一行\n第二行\n第三行";
      const section = extractMatchedSection(content, "关键字");

      expect(section).toContain("关键字在第一行");
      expect(section).toContain("第二行");
      expect(section).toContain("第三行");
    });

    it("should_handle_keyword_at_end_of_content", () => {
      const content = "第一行\n第二行\n关键字在最后一行";
      const section = extractMatchedSection(content, "关键字");

      expect(section).toContain("关键字在最后一行");
      expect(section).toContain("第一行");
      expect(section).toContain("第二行");
    });

    it("should_return_empty_string_when_keyword_not_found", () => {
      const content = "第一行\n第二行\n第三行";
      const section = extractMatchedSection(content, "不存在");

      expect(section).toBe("");
    });
  });

  // ── Chat 上下文加载 (场景 4.2) ──────────────────────────────

  describe("loadWikiContext", () => {
    it("should_return_wiki_page_summaries_matching_input_text", async () => {
      mockQuery.mockResolvedValue([
        {
          id: "wp1",
          title: "铝价分析",
          content: "铝价近期上涨",
          summary: "铝价走势和影响因素分析",
        },
        {
          id: "wp2",
          title: "采购策略",
          content: "铝材采购需要注意",
          summary: "采购策略和供应商管理",
        },
      ]);

      const context = await loadWikiContext("user1", "铝价最近怎么样");

      expect(context.length).toBeGreaterThanOrEqual(1);
      // 返回 title: summary 格式
      expect(context[0]).toContain("铝价分析");
    });

    it("should_return_empty_array_when_no_input_text", async () => {
      const context = await loadWikiContext("user1", undefined);

      expect(context).toEqual([]);
    });

    it("should_return_empty_array_when_no_matching_pages", async () => {
      mockQuery.mockResolvedValue([]);

      const context = await loadWikiContext("user1", "一些关键字");

      expect(context).toEqual([]);
    });

    it("should_limit_results_to_top_5", async () => {
      mockQuery.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: `wp${i}`,
          title: `页面${i}`,
          content: `关键字内容${i}`,
          summary: `摘要${i}`,
        })),
      );

      const context = await loadWikiContext("user1", "关键字");

      expect(context.length).toBeLessThanOrEqual(5);
    });
  });
});
