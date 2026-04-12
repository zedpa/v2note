import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB 层 ──
vi.mock("../../db/repositories/wiki-page.js", () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findAllActive: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  findByParent: vi.fn(),
}));

vi.mock("../../db/repositories/wiki-page-record.js", () => ({
  link: vi.fn(),
  unlinkAllByPage: vi.fn(),
  unlinkAllByRecord: vi.fn(),
  transferAll: vi.fn(),
  findPagesByRecord: vi.fn(),
}));

vi.mock("../../db/pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  getPool: vi.fn(() => ({
    connect: vi.fn(),
  })),
}));

import { manageWikiPageTool } from "./manage-wiki-page.js";
import * as wikiPageRepo from "../../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../../db/repositories/wiki-page-record.js";
import { query, execute } from "../../db/pool.js";

const CTX = { deviceId: "dev-1", userId: "user-1", sessionId: "s-1" };

describe("manage_wiki_page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_have_confirm_autonomy", () => {
    expect(manageWikiPageTool.autonomy).toBe("confirm");
  });

  it("should_have_correct_name", () => {
    expect(manageWikiPageTool.name).toBe("manage_wiki_page");
  });

  // ── 场景 1.1: create ──

  describe("action=create", () => {
    it("should_create_topic_page_when_valid_title", async () => {
      // 无重复标题
      vi.mocked(query).mockResolvedValueOnce([]); // 重复检查
      vi.mocked(wikiPageRepo.create).mockResolvedValue({
        id: "page-1", title: "旅行", level: 3, page_type: "topic",
      } as any);

      const result = await manageWikiPageTool.handler(
        { action: "create", title: "旅行" },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(result.data!.page).toBeDefined();
      expect((result.data!.page as any).title).toBe("旅行");
      expect(wikiPageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          title: "旅行",
          level: 3,
          created_by: "user",
        }),
      );
    });

    it("should_fail_create_when_empty_title", async () => {
      const result = await manageWikiPageTool.handler(
        { action: "create", title: "" },
        CTX,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("标题");
    });

    it("should_fail_create_when_title_missing", async () => {
      const result = await manageWikiPageTool.handler(
        { action: "create" },
        CTX,
      );

      expect(result.success).toBe(false);
    });

    it("should_fail_create_when_duplicate_title_under_same_parent", async () => {
      // 重复检查返回行
      vi.mocked(query).mockResolvedValueOnce([{ id: "existing" }]);

      const result = await manageWikiPageTool.handler(
        { action: "create", title: "旅行" },
        CTX,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("已存在");
    });

    // 场景 1.7: create 子主题
    it("should_create_L2_page_when_parent_id_provided", async () => {
      vi.mocked(query).mockResolvedValueOnce([]); // 重复检查
      vi.mocked(wikiPageRepo.findById).mockResolvedValue({
        id: "parent-1", user_id: "user-1", status: "active",
      } as any);
      vi.mocked(wikiPageRepo.create).mockResolvedValue({
        id: "page-2", title: "采购", level: 2, parent_id: "parent-1",
      } as any);

      const result = await manageWikiPageTool.handler(
        { action: "create", title: "采购", parent_id: "parent-1" },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(wikiPageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_id: "parent-1",
          level: 2,
        }),
      );
    });

    it("should_create_goal_page_with_todo_when_page_type_is_goal", async () => {
      vi.mocked(query).mockResolvedValueOnce([]); // 重复检查

      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: "page-g", title: "减肥", level: 3 }] }) // INSERT wiki_page
          .mockResolvedValueOnce(undefined) // INSERT todo
          .mockResolvedValueOnce(undefined), // COMMIT
        release: vi.fn(),
      };
      const { getPool } = await import("../../db/pool.js");
      vi.mocked(getPool).mockReturnValue({ connect: vi.fn().mockResolvedValue(mockClient) } as any);

      const result = await manageWikiPageTool.handler(
        { action: "create", title: "减肥", page_type: "goal" },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledTimes(4); // BEGIN + INSERT page + INSERT todo + COMMIT
    });
  });

  // ── 场景 1.2: rename ──

  describe("action=rename", () => {
    it("should_rename_page_when_valid", async () => {
      vi.mocked(wikiPageRepo.findById).mockResolvedValue({
        id: "page-1", user_id: "user-1", title: "工作事务", status: "active",
        parent_id: null,
      } as any);
      vi.mocked(query).mockResolvedValueOnce([]); // 重复检查

      const result = await manageWikiPageTool.handler(
        { action: "rename", page_id: "page-1", new_title: "工作" },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(result.data!.old_title).toBe("工作事务");
      expect(result.data!.new_title).toBe("工作");
      expect(wikiPageRepo.update).toHaveBeenCalledWith("page-1", { title: "工作" });
    });

    it("should_fail_rename_when_page_not_found", async () => {
      vi.mocked(wikiPageRepo.findById).mockResolvedValue(null);

      const result = await manageWikiPageTool.handler(
        { action: "rename", page_id: "nonexistent", new_title: "工作" },
        CTX,
      );

      expect(result.success).toBe(false);
    });

    it("should_fail_rename_when_duplicate_title", async () => {
      vi.mocked(wikiPageRepo.findById).mockResolvedValue({
        id: "page-1", user_id: "user-1", title: "旧标题", status: "active",
        parent_id: null,
      } as any);
      vi.mocked(query).mockResolvedValueOnce([{ id: "other" }]); // 重复检查命中

      const result = await manageWikiPageTool.handler(
        { action: "rename", page_id: "page-1", new_title: "已存在标题" },
        CTX,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("已存在");
    });

    it("should_fail_rename_when_empty_new_title", async () => {
      const result = await manageWikiPageTool.handler(
        { action: "rename", page_id: "page-1", new_title: "" },
        CTX,
      );

      expect(result.success).toBe(false);
    });

    it("should_fail_rename_when_missing_page_id", async () => {
      const result = await manageWikiPageTool.handler(
        { action: "rename", new_title: "工作" },
        CTX,
      );

      expect(result.success).toBe(false);
    });
  });

  // ── 场景 1.3: delete ──

  describe("action=delete", () => {
    it("should_archive_page_and_unlink_records_when_no_children", async () => {
      vi.mocked(wikiPageRepo.findById).mockResolvedValue({
        id: "page-1", user_id: "user-1", status: "active", page_type: "topic",
      } as any);
      vi.mocked(wikiPageRecordRepo.unlinkAllByPage).mockResolvedValue(["rec-1", "rec-2"]);
      vi.mocked(wikiPageRepo.findByParent).mockResolvedValue([]); // 无子页面
      vi.mocked(execute).mockResolvedValue(2); // compile_status 清除

      const result = await manageWikiPageTool.handler(
        { action: "delete", page_id: "page-1" },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(result.data!.unlinked_records).toBe(2);
      expect(wikiPageRecordRepo.unlinkAllByPage).toHaveBeenCalledWith("page-1");
      expect(wikiPageRepo.updateStatus).toHaveBeenCalledWith("page-1", "archived");
    });

    // 场景 1.3b: delete 有子页面
    it("should_promote_children_when_deleting_parent_page", async () => {
      vi.mocked(wikiPageRepo.findById).mockResolvedValue({
        id: "page-p", user_id: "user-1", status: "active", page_type: "topic",
      } as any);
      vi.mocked(wikiPageRecordRepo.unlinkAllByPage).mockResolvedValue(["rec-1"]);
      vi.mocked(wikiPageRepo.findByParent).mockResolvedValue([
        { id: "child-1" } as any,
        { id: "child-2" } as any,
      ]);
      vi.mocked(execute).mockResolvedValue(1);

      const result = await manageWikiPageTool.handler(
        { action: "delete", page_id: "page-p" },
        CTX,
      );

      expect(result.success).toBe(true);
      // 子页面提升调用
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("parent_id = NULL"),
        expect.arrayContaining(["page-p"]),
      );
    });

    it("should_clear_todo_wiki_page_id_when_deleting_goal_page", async () => {
      vi.mocked(wikiPageRepo.findById).mockResolvedValue({
        id: "page-g", user_id: "user-1", status: "active", page_type: "goal",
      } as any);
      vi.mocked(wikiPageRecordRepo.unlinkAllByPage).mockResolvedValue([]);
      vi.mocked(wikiPageRepo.findByParent).mockResolvedValue([]);
      vi.mocked(execute).mockResolvedValue(0);

      const result = await manageWikiPageTool.handler(
        { action: "delete", page_id: "page-g" },
        CTX,
      );

      expect(result.success).toBe(true);
      // 应该清除 todo.wiki_page_id
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("todo"),
        expect.arrayContaining(["page-g"]),
      );
    });

    it("should_fail_delete_when_page_not_found", async () => {
      vi.mocked(wikiPageRepo.findById).mockResolvedValue(null);

      const result = await manageWikiPageTool.handler(
        { action: "delete", page_id: "nonexistent" },
        CTX,
      );

      expect(result.success).toBe(false);
    });

    it("should_fail_delete_when_missing_page_id", async () => {
      const result = await manageWikiPageTool.handler(
        { action: "delete" },
        CTX,
      );

      expect(result.success).toBe(false);
    });
  });

  // ── 场景 1.4: merge ──

  describe("action=merge", () => {
    it("should_transfer_records_and_archive_source_when_valid", async () => {
      vi.mocked(wikiPageRepo.findById)
        .mockResolvedValueOnce({ id: "src", user_id: "user-1", status: "active", page_type: "topic" } as any) // source
        .mockResolvedValueOnce({ id: "tgt", user_id: "user-1", status: "active" } as any); // target
      vi.mocked(wikiPageRecordRepo.transferAll).mockResolvedValue(5);
      vi.mocked(query).mockResolvedValue([]); // todo 查询

      const result = await manageWikiPageTool.handler(
        { action: "merge", source_id: "src", target_id: "tgt" },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(result.data!.transferred_records).toBe(5);
      expect(wikiPageRecordRepo.transferAll).toHaveBeenCalledWith("src", "tgt");
      expect(wikiPageRepo.updateStatus).toHaveBeenCalledWith("src", "merged", "tgt");
    });

    it("should_fail_merge_when_target_not_active", async () => {
      vi.mocked(wikiPageRepo.findById)
        .mockResolvedValueOnce({ id: "src", user_id: "user-1", status: "active" } as any)
        .mockResolvedValueOnce({ id: "tgt", user_id: "user-1", status: "archived" } as any);

      const result = await manageWikiPageTool.handler(
        { action: "merge", source_id: "src", target_id: "tgt" },
        CTX,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("active");
    });

    it("should_transfer_goal_todo_when_source_is_goal_page", async () => {
      vi.mocked(wikiPageRepo.findById)
        .mockResolvedValueOnce({ id: "src", user_id: "user-1", status: "active", page_type: "goal" } as any)
        .mockResolvedValueOnce({ id: "tgt", user_id: "user-1", status: "active" } as any);
      vi.mocked(wikiPageRecordRepo.transferAll).mockResolvedValue(3);
      // goal todo 存在
      vi.mocked(query).mockResolvedValueOnce([{ id: "todo-1" }]);

      const result = await manageWikiPageTool.handler(
        { action: "merge", source_id: "src", target_id: "tgt" },
        CTX,
      );

      expect(result.success).toBe(true);
      // 应该更新 todo.wiki_page_id
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("wiki_page_id"),
        expect.arrayContaining(["tgt", "src"]),
      );
    });

    it("should_fail_merge_when_missing_source_or_target", async () => {
      const result = await manageWikiPageTool.handler(
        { action: "merge", source_id: "src" },
        CTX,
      );

      expect(result.success).toBe(false);
    });
  });

  // ── 场景 1.5: move_record ──

  describe("action=move_record", () => {
    it("should_move_record_to_new_page_when_valid", async () => {
      // record 验证
      vi.mocked(query).mockResolvedValueOnce([{ id: "rec-1", user_id: "user-1" }]);
      // page 验证
      vi.mocked(wikiPageRepo.findById).mockResolvedValue({
        id: "page-1", user_id: "user-1", title: "学习", status: "active",
      } as any);
      // 旧关联
      vi.mocked(wikiPageRecordRepo.findPagesByRecord).mockResolvedValue([
        { wiki_page_id: "old-page", record_id: "rec-1", added_at: "" },
      ]);

      const result = await manageWikiPageTool.handler(
        { action: "move_record", record_id: "rec-1", page_id: "page-1" },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(wikiPageRecordRepo.unlinkAllByRecord).toHaveBeenCalledWith("rec-1");
      expect(wikiPageRecordRepo.link).toHaveBeenCalledWith("page-1", "rec-1");
    });

    it("should_unlink_only_when_page_id_is_null", async () => {
      // record 验证
      vi.mocked(query).mockResolvedValueOnce([{ id: "rec-1", user_id: "user-1" }]);
      vi.mocked(wikiPageRecordRepo.findPagesByRecord).mockResolvedValue([]);

      const result = await manageWikiPageTool.handler(
        { action: "move_record", record_id: "rec-1", page_id: null },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(wikiPageRecordRepo.unlinkAllByRecord).toHaveBeenCalledWith("rec-1");
      // 不应该 link
      expect(wikiPageRecordRepo.link).not.toHaveBeenCalled();
    });

    it("should_fail_move_when_page_not_found", async () => {
      vi.mocked(query).mockResolvedValueOnce([{ id: "rec-1", user_id: "user-1" }]);
      vi.mocked(wikiPageRepo.findById).mockResolvedValue(null);

      const result = await manageWikiPageTool.handler(
        { action: "move_record", record_id: "rec-1", page_id: "nonexistent" },
        CTX,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("should_fail_move_when_record_not_found", async () => {
      vi.mocked(query).mockResolvedValueOnce([]); // record 不存在

      const result = await manageWikiPageTool.handler(
        { action: "move_record", record_id: "nonexistent", page_id: "page-1" },
        CTX,
      );

      expect(result.success).toBe(false);
    });

    it("should_fail_move_when_missing_record_id", async () => {
      const result = await manageWikiPageTool.handler(
        { action: "move_record" },
        CTX,
      );

      expect(result.success).toBe(false);
    });
  });

  // ── 场景 1.6: list ──

  describe("action=list", () => {
    it("should_return_pages_with_counts_when_user_has_pages", async () => {
      vi.mocked(wikiPageRepo.findAllActive).mockResolvedValue([
        { id: "p1", title: "工作", level: 3, parent_id: null } as any,
        { id: "p2", title: "生活", level: 3, parent_id: null } as any,
      ]);
      // record counts 查询
      vi.mocked(query)
        .mockResolvedValueOnce([
          { wiki_page_id: "p1", cnt: "10" },
          { wiki_page_id: "p2", cnt: "5" },
        ])
        // child counts
        .mockResolvedValueOnce([])
        // inbox count
        .mockResolvedValueOnce([{ count: "3" }]);

      const result = await manageWikiPageTool.handler(
        { action: "list" },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(result.data!.pages).toBeDefined();
      expect((result.data!.pages as any[]).length).toBe(2);
      expect(result.data!.inbox_count).toBeDefined();
    });

    it("should_return_empty_array_and_inbox_count_when_no_pages", async () => {
      vi.mocked(wikiPageRepo.findAllActive).mockResolvedValue([]);
      vi.mocked(query)
        .mockResolvedValueOnce([]) // record counts
        .mockResolvedValueOnce([]) // child counts
        .mockResolvedValueOnce([{ count: "10" }]); // inbox

      const result = await manageWikiPageTool.handler(
        { action: "list" },
        CTX,
      );

      expect(result.success).toBe(true);
      expect((result.data!.pages as any[])).toHaveLength(0);
      expect(result.data!.inbox_count).toBe(10);
    });
  });

  // ── 通用边界 ──

  it("should_fail_when_no_userId", async () => {
    const result = await manageWikiPageTool.handler(
      { action: "list" },
      { deviceId: "dev-1", sessionId: "s-1" },
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("用户身份");
  });

  it("should_fail_when_unknown_action", async () => {
    const result = await manageWikiPageTool.handler(
      { action: "unknown_action" },
      CTX,
    );

    expect(result.success).toBe(false);
  });
});
