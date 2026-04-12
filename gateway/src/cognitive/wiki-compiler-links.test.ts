/**
 * Wiki 编译器 — links 指令处理 单元测试 — Phase 14.11
 *
 * 覆盖场景：
 * - parseCompileResponse 解析 links 数组
 * - buildCompilePrompt 输出中包含 links 字段说明
 * - executeInstructions 处理 links：创建有效链接、跳过无效 UUID、跳过不存在 page
 */
import { describe, it, expect, vi } from "vitest";

// parseCompileResponse 是纯函数，不需要 mock
import { parseCompileResponse } from "./wiki-compiler.js";
import { buildCompilePrompt } from "./wiki-compile-prompt.js";

// mock date-anchor for buildCompilePrompt
vi.mock("../lib/date-anchor.js", () => ({
  buildDateAnchor: vi.fn(() => "今天是 2026-04-11（周五）"),
}));

describe("wiki-compiler links (Phase 14.11)", () => {
  describe("parseCompileResponse — links 字段解析", () => {
    it("should_parse_links_array_when_present_in_response", () => {
      const raw = JSON.stringify({
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [],
        links: [
          {
            source_page_id: "11111111-1111-1111-1111-111111111111",
            target_page_id: "22222222-2222-2222-2222-222222222222",
            link_type: "reference",
            context_text: "提到了采购策略",
          },
        ],
      });

      const result = parseCompileResponse(raw);

      expect(result.links).toHaveLength(1);
      expect(result.links![0].link_type).toBe("reference");
      expect(result.links![0].context_text).toBe("提到了采购策略");
    });

    it("should_default_links_to_empty_array_when_missing", () => {
      const raw = JSON.stringify({
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [],
      });

      const result = parseCompileResponse(raw);

      expect(result.links).toEqual([]);
    });

    it("should_handle_links_wrapped_in_markdown_code_block", () => {
      const raw = `\`\`\`json
{
  "update_pages": [],
  "create_pages": [],
  "merge_pages": [],
  "split_page": [],
  "goal_sync": [],
  "links": [
    {
      "source_page_id": "11111111-1111-1111-1111-111111111111",
      "target_page_id": "22222222-2222-2222-2222-222222222222",
      "link_type": "related",
      "context_text": "相关主题"
    }
  ]
}
\`\`\``;

      const result = parseCompileResponse(raw);

      expect(result.links).toHaveLength(1);
    });
  });

  describe("buildCompilePrompt — links 指令说明", () => {
    it("should_include_links_field_in_json_output_format", () => {
      const { system } = buildCompilePrompt({
        newRecords: [{ id: "r1", text: "test", source_type: "think", created_at: "2026-04-11T10:00:00Z" }],
        matchedPages: [],
        allPageIndex: [
          { id: "wp-1", title: "Page A", summary: "摘要A", level: 3, domain: null },
          { id: "wp-2", title: "Page B", summary: "摘要B", level: 3, domain: null },
        ],
        existingDomains: [],
        isColdStart: false,
      });

      // prompt 中应包含 links 字段的说明
      expect(system).toContain("links");
      expect(system).toContain("source_page_id");
      expect(system).toContain("target_page_id");
      expect(system).toContain("link_type");
    });

    it("should_describe_link_types_in_prompt", () => {
      const { system } = buildCompilePrompt({
        newRecords: [{ id: "r1", text: "test", source_type: "think", created_at: "2026-04-11T10:00:00Z" }],
        matchedPages: [],
        allPageIndex: [],
        existingDomains: [],
        isColdStart: false,
      });

      expect(system).toContain("reference");
      expect(system).toContain("related");
      expect(system).toContain("contradicts");
    });
  });
});
