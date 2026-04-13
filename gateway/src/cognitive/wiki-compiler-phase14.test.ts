/**
 * Phase 14.6 & 14.7 — Goal Page + 分级授权 集成测试
 *
 * 测试 executeInstructions 中的:
 * - goal_sync create 同时创建 goal page
 * - split_page / merge_pages 的分级授权检查
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 外部依赖 ──
const mockPoolConnect = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();

const mockWikiPageExists = vi.fn();
const mockWikiPageFindById = vi.fn();
const mockWikiPageCreate = vi.fn();
const mockWikiPageUpdate = vi.fn();
const mockWikiPageRecordInheritAll = vi.fn();
const mockWikiPageRecordTransferAll = vi.fn();
const mockTodoCreate = vi.fn();
const mockTodoTransferWikiPageRef = vi.fn();

vi.mock("../db/pool.js", () => ({
  getPool: () => ({
    connect: () => mockPoolConnect(),
  }),
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../db/repositories/record.js", () => ({
  findPendingCompile: vi.fn(),
  updateCompileStatus: vi.fn(),
  countUndigested: vi.fn(),
}));

vi.mock("../db/repositories/wiki-page.js", () => ({
  findByUser: vi.fn(),
  findById: (...args: any[]) => mockWikiPageFindById(...args),
  create: (...args: any[]) => mockWikiPageCreate(...args),
  update: (...args: any[]) => mockWikiPageUpdate(...args),
  updateStatus: vi.fn(),
  findByParent: vi.fn(),
  exists: (...args: any[]) => mockWikiPageExists(...args),
}));

vi.mock("../db/repositories/wiki-page-record.js", () => ({
  findPagesByRecords: vi.fn().mockResolvedValue([]),
  link: vi.fn(),
  transferAll: (...args: any[]) => mockWikiPageRecordTransferAll(...args),
  inheritAll: (...args: any[]) => mockWikiPageRecordInheritAll(...args),
}));

vi.mock("../db/repositories/wiki-page-link.js", () => ({
  createLink: vi.fn(),
}));

vi.mock("../db/repositories/todo.js", () => ({
  create: (...args: any[]) => mockTodoCreate(...args),
  update: vi.fn(),
  transferWikiPageRef: (...args: any[]) => mockTodoTransferWikiPageRef(...args),
}));

vi.mock("../db/repositories/goal.js", () => ({
  create: vi.fn(),
  update: vi.fn(),
  findByUser: vi.fn(),
}));

vi.mock("../ai/provider.js", () => ({
  chatCompletion: vi.fn(),
}));

vi.mock("./wiki-compile-prompt.js", () => ({
  buildCompilePrompt: vi.fn().mockReturnValue({ system: "s", user: "u" }),
}));

vi.mock("../lib/tz.js", () => ({
  today: () => "2026-04-11",
  now: () => new Date("2026-04-11T10:00:00+08:00"),
}));

// mock page-authorization — 让 canAiModifyStructure 按 created_by 判断
const mockCanAiModifyStructure = vi.fn();
const mockCreateSuggestion = vi.fn();

vi.mock("./page-authorization.js", () => ({
  canAiModifyStructure: (...args: any[]) => mockCanAiModifyStructure(...args),
  createSuggestion: (...args: any[]) => mockCreateSuggestion(...args),
}));

import {
  executeInstructions,
  type CompileInstructions,
} from "./wiki-compiler.js";

// 合法 UUID 常量
const PAGE_AI = "00000000-0000-4000-a000-000000000010";
const PAGE_USER = "00000000-0000-4000-a000-000000000011";
const PAGE_TGT = "00000000-0000-4000-a000-000000000012";
const REC_1 = "10000000-0000-4000-a000-000000000001";
const USER_ID = "00000000-0000-4000-a000-000000000020";
const NEW_GOAL_PAGE_ID = "00000000-0000-4000-a000-000000000099";

describe("wiki-compiler Phase 14.6 & 14.7", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });

    // client.query 只处理事务控制 + 少量保留的 raw SQL
    mockClientQuery.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK") || sql.includes("SET LOCAL")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT device_id FROM record")) {
        return { rows: [{ device_id: "dev-1" }] };
      }
      if (sql.includes("UPDATE record SET compile_status")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    // ── repo mock 默认值 ──
    mockWikiPageExists.mockResolvedValue(true);
    mockWikiPageFindById.mockResolvedValue({ id: PAGE_AI, level: 3, domain: null, created_by: "ai" });
    mockWikiPageCreate.mockResolvedValue({ id: NEW_GOAL_PAGE_ID });
    mockWikiPageUpdate.mockResolvedValue(undefined);
    mockWikiPageRecordInheritAll.mockResolvedValue(0);
    mockWikiPageRecordTransferAll.mockResolvedValue(0);
    mockTodoCreate.mockResolvedValue({ id: "todo-1" });
    mockTodoTransferWikiPageRef.mockResolvedValue(0);

    // 默认：AI 创建的 page 可修改
    mockCanAiModifyStructure.mockReturnValue(true);
    mockCreateSuggestion.mockResolvedValue({ id: "suggestion-1", status: "pending" });
  });

  // ── Phase 14.6: goal_sync create 同时创建 goal page ──

  describe("goal_sync_create_with_goal_page", () => {
    it("should_create_goal_page_when_goal_sync_action_is_create", async () => {
      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [
          {
            action: "create",
            title: "通过四级考试",
            status: "active",
          },
        ],
      };

      await executeInstructions(instructions, USER_ID, [REC_1]);

      // 验证通过 repo 创建了 goal page（page_type='goal', created_by='ai'）
      expect(mockWikiPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          page_type: "goal",
          created_by: "ai",
          title: "通过四级考试",
        }),
        expect.anything(), // client
      );

      // 验证通过 repo 创建了 todo 并且 wiki_page_id 指向新 page
      expect(mockTodoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "通过四级考试",
          wiki_page_id: NEW_GOAL_PAGE_ID,
          level: 1,
          category: "emerged",
        }),
        expect.anything(), // client
      );
    });

    it("should_set_goal_wiki_page_id_to_new_page_when_no_existing_wiki_page_id", async () => {
      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [
          {
            action: "create",
            title: "今年减重10kg",
            status: "active",
            // 没有 wiki_page_id — 应自动创建
          },
        ],
      };

      await executeInstructions(instructions, USER_ID, [REC_1]);

      // 应创建 wiki_page 和 todo
      expect(mockWikiPageCreate).toHaveBeenCalled();
      expect(mockTodoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "今年减重10kg",
          wiki_page_id: NEW_GOAL_PAGE_ID,
        }),
        expect.anything(),
      );
    });
  });

  // ── Phase 14.7: split_page 分级授权 ──

  describe("split_page_authorization", () => {
    it("should_execute_split_directly_when_page_created_by_ai", async () => {
      // AI 创建的 page → 直接执行
      mockCanAiModifyStructure.mockReturnValue(true);
      mockWikiPageFindById.mockResolvedValue({ id: PAGE_AI, level: 3, domain: "工作", created_by: "ai" });

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [
          {
            source_id: PAGE_AI,
            new_parent_content: "拆分后内容",
            children: [
              { title: "子页A", content: "内容A", summary: "摘要A" },
            ],
          },
        ],
        goal_sync: [],
      };

      const result = await executeInstructions(instructions, USER_ID, [REC_1]);
      expect(result.pages_split).toBe(1);
      // 不应创建 suggestion
      expect(mockCreateSuggestion).not.toHaveBeenCalled();
      // 应通过 repo 创建子 page
      expect(mockWikiPageCreate).toHaveBeenCalled();
    });

    it("should_create_suggestion_instead_of_split_when_page_created_by_user", async () => {
      // 用户创建的 page → 创建 suggestion
      mockCanAiModifyStructure.mockReturnValue(false);
      mockWikiPageFindById.mockResolvedValue({ id: PAGE_USER, level: 3, domain: null, created_by: "user" });

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [
          {
            source_id: PAGE_USER,
            new_parent_content: "拆分后内容",
            children: [
              { title: "子页A", content: "内容A", summary: "摘要A" },
            ],
          },
        ],
        goal_sync: [],
      };

      const result = await executeInstructions(instructions, USER_ID, [REC_1]);
      // 不应实际执行 split
      expect(result.pages_split).toBe(0);
      // 应创建 suggestion
      expect(mockCreateSuggestion).toHaveBeenCalledWith(
        USER_ID,
        "split",
        expect.objectContaining({ source_id: PAGE_USER }),
      );
    });
  });

  // ── Phase 14.7: merge_pages 分级授权 ──

  describe("merge_pages_authorization", () => {
    it("should_execute_merge_directly_when_source_page_created_by_ai", async () => {
      mockCanAiModifyStructure.mockReturnValue(true);
      mockWikiPageFindById.mockResolvedValue({ id: PAGE_AI, created_by: "ai" });

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [
          { source_id: PAGE_AI, target_id: PAGE_TGT, reason: "重叠" },
        ],
        split_page: [],
        goal_sync: [],
      };

      const result = await executeInstructions(instructions, USER_ID, [REC_1]);
      expect(result.pages_merged).toBe(1);
      expect(mockCreateSuggestion).not.toHaveBeenCalled();
      // 验证 repo 方法被调用
      expect(mockWikiPageUpdate).toHaveBeenCalled();
      expect(mockWikiPageRecordTransferAll).toHaveBeenCalled();
      expect(mockTodoTransferWikiPageRef).toHaveBeenCalled();
    });

    it("should_create_suggestion_instead_of_merge_when_source_page_created_by_user", async () => {
      mockCanAiModifyStructure.mockReturnValue(false);
      mockWikiPageFindById.mockResolvedValue({ id: PAGE_USER, created_by: "user" });

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [
          { source_id: PAGE_USER, target_id: PAGE_TGT, reason: "重叠" },
        ],
        split_page: [],
        goal_sync: [],
      };

      const result = await executeInstructions(instructions, USER_ID, [REC_1]);
      expect(result.pages_merged).toBe(0);
      expect(mockCreateSuggestion).toHaveBeenCalledWith(
        USER_ID,
        "merge",
        expect.objectContaining({ source_id: PAGE_USER, target_id: PAGE_TGT }),
      );
    });
  });
});
