import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import {
  create,
  findById,
  findByUser,
  update,
  updateStatus,
  findByParent,
  findRoots,
} from "./wiki-page.js";
import { query, queryOne, execute } from "../pool.js";

const mockPage = {
  id: "wp-1",
  user_id: "u-1",
  title: "供应链管理",
  content: "## 核心认知\n...",
  summary: "关于供应链的知识",
  parent_id: null,
  level: 3,
  status: "active",
  merged_into: null,
  domain: "工作",
  embedding: null,
  metadata: {},
  compiled_at: null,
  created_at: "2026-04-09T10:00:00Z",
  updated_at: "2026-04-09T10:00:00Z",
};

describe("wiki-page repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 场景 1.1: wiki_page 表 CRUD ──

  describe("create", () => {
    it("should_insert_wiki_page_when_basic_fields_provided", async () => {
      vi.mocked(queryOne).mockResolvedValue(mockPage as any);

      const result = await create({
        user_id: "u-1",
        title: "供应链管理",
        content: "## 核心认知\n...",
        summary: "关于供应链的知识",
        domain: "工作",
      });

      expect(result.id).toBe("wp-1");
      expect(result.title).toBe("供应链管理");
      const sql = vi.mocked(queryOne).mock.calls[0][0];
      expect(sql).toContain("INSERT INTO wiki_page");
      expect(sql).toContain("RETURNING *");
      // 不含 embedding 占位符
      expect(sql).not.toContain("::vector");
    });

    it("should_include_embedding_when_provided", async () => {
      vi.mocked(queryOne).mockResolvedValue({ ...mockPage, embedding: [0.1, 0.2] } as any);

      await create({
        user_id: "u-1",
        title: "测试",
        embedding: [0.1, 0.2, 0.3],
      });

      const sql = vi.mocked(queryOne).mock.calls[0][0];
      expect(sql).toContain("::vector");
      const params = vi.mocked(queryOne).mock.calls[0][1]!;
      // embedding 参数是最后一个，格式为 "[0.1,0.2,0.3]"
      expect(params[params.length - 1]).toBe("[0.1,0.2,0.3]");
    });

    it("should_default_level_to_3_when_not_specified", async () => {
      vi.mocked(queryOne).mockResolvedValue(mockPage as any);

      await create({ user_id: "u-1", title: "测试" });

      const params = vi.mocked(queryOne).mock.calls[0][1]!;
      // level 是第 6 个参数（索引 5）
      expect(params[5]).toBe(3);
    });

    it("should_default_content_to_empty_string_when_not_specified", async () => {
      vi.mocked(queryOne).mockResolvedValue(mockPage as any);

      await create({ user_id: "u-1", title: "测试" });

      const params = vi.mocked(queryOne).mock.calls[0][1]!;
      // content 是第 3 个参数（索引 2）
      expect(params[2]).toBe("");
    });

    it("should_serialize_metadata_as_json_when_provided", async () => {
      vi.mocked(queryOne).mockResolvedValue(mockPage as any);

      await create({
        user_id: "u-1",
        title: "测试",
        metadata: { contradictions: 2 },
      });

      const params = vi.mocked(queryOne).mock.calls[0][1]!;
      // metadata 是第 8 个参数（索引 7）
      expect(params[7]).toBe(JSON.stringify({ contradictions: 2 }));
    });
  });

  describe("findById", () => {
    it("should_return_page_when_found", async () => {
      vi.mocked(queryOne).mockResolvedValue(mockPage as any);

      const result = await findById("wp-1");
      expect(result).toEqual(mockPage);
      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM wiki_page WHERE id = $1"),
        ["wp-1"],
      );
    });

    it("should_return_null_when_not_found", async () => {
      vi.mocked(queryOne).mockResolvedValue(null);

      const result = await findById("wp-nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("findByUser", () => {
    it("should_return_all_pages_for_user_when_no_status_filter", async () => {
      vi.mocked(query).mockResolvedValue([mockPage] as any);

      const result = await findByUser("u-1");
      expect(result).toHaveLength(1);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("user_id = $1");
      expect(sql).toContain("ORDER BY updated_at DESC");
      expect(sql).not.toContain("status =");
    });

    it("should_filter_by_status_when_specified", async () => {
      vi.mocked(query).mockResolvedValue([mockPage] as any);

      await findByUser("u-1", { status: "active" });
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("status = $2");
      const params = vi.mocked(query).mock.calls[0][1]!;
      expect(params).toContain("active");
    });

    it("should_respect_limit_when_specified", async () => {
      vi.mocked(query).mockResolvedValue([] as any);

      await findByUser("u-1", { limit: 50 });
      const params = vi.mocked(query).mock.calls[0][1]!;
      expect(params[params.length - 1]).toBe(50);
    });

    it("should_default_limit_to_100_when_not_specified", async () => {
      vi.mocked(query).mockResolvedValue([] as any);

      await findByUser("u-1");
      const params = vi.mocked(query).mock.calls[0][1]!;
      expect(params[params.length - 1]).toBe(100);
    });
  });

  describe("update", () => {
    it("should_update_title_when_specified", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await update("wp-1", { title: "新标题" });
      const sql = vi.mocked(execute).mock.calls[0][0];
      expect(sql).toContain("title = $1");
      expect(sql).toContain("updated_at = now()");
      expect(sql).toContain("WHERE id = $2");
      const params = vi.mocked(execute).mock.calls[0][1]!;
      expect(params).toEqual(["新标题", "wp-1"]);
    });

    it("should_update_multiple_fields_when_specified", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await update("wp-1", {
        title: "新标题",
        content: "新内容",
        summary: "新摘要",
        level: 2,
        domain: "学习",
        compiled_at: "2026-04-09T12:00:00Z",
      });

      const sql = vi.mocked(execute).mock.calls[0][0];
      expect(sql).toContain("title = $1");
      expect(sql).toContain("content = $2");
      expect(sql).toContain("summary = $3");
      expect(sql).toContain("level = $4");
      expect(sql).toContain("domain = $5");
      expect(sql).toContain("compiled_at = $6");
      expect(sql).toContain("updated_at = now()");
      expect(sql).toContain("WHERE id = $7");
    });

    it("should_noop_when_no_fields_specified", async () => {
      await update("wp-1", {});
      expect(execute).not.toHaveBeenCalled();
    });

    it("should_format_embedding_as_vector_when_specified", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await update("wp-1", { embedding: [0.1, 0.2] });
      const sql = vi.mocked(execute).mock.calls[0][0];
      expect(sql).toContain("::vector");
      const params = vi.mocked(execute).mock.calls[0][1]!;
      expect(params[0]).toBe("[0.1,0.2]");
    });

    it("should_serialize_metadata_as_json_when_specified", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await update("wp-1", { metadata: { key: "value" } });
      const params = vi.mocked(execute).mock.calls[0][1]!;
      expect(params[0]).toBe(JSON.stringify({ key: "value" }));
    });
  });

  describe("updateStatus", () => {
    it("should_update_status_when_no_merged_into", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await updateStatus("wp-1", "archived");
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("status = $1"),
        ["archived", "wp-1"],
      );
      const sql = vi.mocked(execute).mock.calls[0][0];
      expect(sql).toContain("updated_at = now()");
      expect(sql).not.toContain("merged_into");
    });

    it("should_set_merged_into_when_merging", async () => {
      vi.mocked(execute).mockResolvedValue(1);

      await updateStatus("wp-1", "merged", "wp-2");
      const sql = vi.mocked(execute).mock.calls[0][0];
      expect(sql).toContain("merged_into = $2");
      const params = vi.mocked(execute).mock.calls[0][1]!;
      expect(params).toEqual(["merged", "wp-2", "wp-1"]);
    });
  });

  describe("findByParent", () => {
    it("should_return_active_children_of_parent", async () => {
      vi.mocked(query).mockResolvedValue([{ ...mockPage, parent_id: "wp-parent" }] as any);

      const result = await findByParent("wp-parent");
      expect(result).toHaveLength(1);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("parent_id = $1");
      expect(sql).toContain("status = 'active'");
    });
  });

  describe("findRoots", () => {
    it("should_return_active_level_3_pages_for_user", async () => {
      vi.mocked(query).mockResolvedValue([mockPage] as any);

      const result = await findRoots("u-1");
      expect(result).toHaveLength(1);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("user_id = $1");
      expect(sql).toContain("level = 3");
      expect(sql).toContain("status = 'active'");
      expect(sql).toContain("ORDER BY updated_at DESC");
    });
  });
});
