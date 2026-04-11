/**
 * wiki_page_link repository 单元测试 — Phase 14.1
 *
 * 覆盖 wiki_page_link 表的 CRUD 操作。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import {
  createLink,
  findBySource,
  findByTarget,
  findByPage,
  removeLink,
} from "./wiki-page-link.js";
import { query, queryOne, execute } from "../pool.js";

const mockLink = {
  id: "link-1",
  source_page_id: "wp-1",
  target_page_id: "wp-2",
  link_type: "reference",
  context_text: "与采购策略相关",
  created_at: "2026-04-11T10:00:00Z",
};

describe("wiki-page-link repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createLink", () => {
    it("should_insert_link_when_valid_fields_provided", async () => {
      vi.mocked(queryOne).mockResolvedValue(mockLink as any);

      const result = await createLink({
        source_page_id: "wp-1",
        target_page_id: "wp-2",
        link_type: "reference",
        context_text: "与采购策略相关",
      });

      expect(result).toEqual(mockLink);
      const sql = vi.mocked(queryOne).mock.calls[0][0];
      expect(sql).toContain("INSERT INTO wiki_page_link");
      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("RETURNING *");
    });

    it("should_handle_null_context_text_when_not_provided", async () => {
      vi.mocked(queryOne).mockResolvedValue({ ...mockLink, context_text: null } as any);

      await createLink({
        source_page_id: "wp-1",
        target_page_id: "wp-2",
        link_type: "related",
      });

      const params = vi.mocked(queryOne).mock.calls[0][1]!;
      expect(params[3]).toBeNull();
    });
  });

  describe("findBySource", () => {
    it("should_return_links_from_source_page_when_found", async () => {
      vi.mocked(query).mockResolvedValue([mockLink] as any);

      const result = await findBySource("wp-1");
      expect(result).toHaveLength(1);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("source_page_id = $1");
    });
  });

  describe("findByTarget", () => {
    it("should_return_links_to_target_page_when_found", async () => {
      vi.mocked(query).mockResolvedValue([mockLink] as any);

      const result = await findByTarget("wp-2");
      expect(result).toHaveLength(1);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("target_page_id = $1");
    });
  });

  describe("findByPage", () => {
    it("should_return_all_links_involving_page_when_found", async () => {
      vi.mocked(query).mockResolvedValue([mockLink] as any);

      const result = await findByPage("wp-1");
      expect(result).toHaveLength(1);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("source_page_id = $1");
      expect(sql).toContain("target_page_id = $1");
    });
  });

  describe("removeLink", () => {
    it("should_delete_link_when_id_provided", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await removeLink("link-1");
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM wiki_page_link"),
        ["link-1"],
      );
    });
  });
});
