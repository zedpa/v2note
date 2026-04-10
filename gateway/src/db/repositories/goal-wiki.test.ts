/**
 * goal repository — wiki_page_id 相关扩展测试
 * regression: cognitive-wiki Phase 1
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import { update, updateWikiPageRef, findById, findActiveByUser } from "./goal.js";
import { query, queryOne, execute } from "../pool.js";

describe("goal repository — wiki_page_id 扩展", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("SELECT_AS_GOAL", () => {
    it("should_include_wiki_page_id_in_select_when_querying_by_user", async () => {
      vi.mocked(query).mockResolvedValue([]);

      await findActiveByUser("u-1");
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("wiki_page_id");
    });

    it("should_include_wiki_page_id_in_select_when_finding_by_id", async () => {
      vi.mocked(queryOne).mockResolvedValue(null);

      await findById("goal-1");
      const sql = vi.mocked(queryOne).mock.calls[0][0];
      expect(sql).toContain("wiki_page_id");
    });
  });

  describe("update with wiki_page_id", () => {
    it("should_set_wiki_page_id_when_specified_in_update", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await update("goal-1", { wiki_page_id: "wp-1" });
      const sql = vi.mocked(execute).mock.calls[0][0];
      expect(sql).toContain("wiki_page_id = $");
      const params = vi.mocked(execute).mock.calls[0][1]!;
      expect(params).toContain("wp-1");
      expect(params).toContain("goal-1");
    });

    it("should_allow_null_wiki_page_id_to_clear_association", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await update("goal-1", { wiki_page_id: null });
      const params = vi.mocked(execute).mock.calls[0][1]!;
      expect(params).toContain(null);
    });
  });

  describe("updateWikiPageRef", () => {
    it("should_update_wiki_page_id_for_goal_level_records", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await updateWikiPageRef("goal-1", "wp-1");
      const sql = vi.mocked(execute).mock.calls[0][0];
      expect(sql).toContain("wiki_page_id = $1");
      expect(sql).toContain("updated_at = now()");
      expect(sql).toContain("level >= 1");
      expect(vi.mocked(execute).mock.calls[0][1]).toEqual(["wp-1", "goal-1"]);
    });

    it("should_clear_wiki_page_id_when_null_passed", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await updateWikiPageRef("goal-1", null);
      expect(vi.mocked(execute).mock.calls[0][1]).toEqual([null, "goal-1"]);
    });
  });
});
