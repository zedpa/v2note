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
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  findByParent: vi.fn(),
}));

vi.mock("../db/repositories/goal.js", () => ({
  create: vi.fn(),
  update: vi.fn(),
  findByUser: vi.fn(),
}));

vi.mock("../ai/provider.js", () => ({
  chatCompletion: vi.fn(),
}));

vi.mock("../db/repositories/wiki-page-record.js", () => ({
  findPagesByRecords: vi.fn().mockResolvedValue([]),
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

    // 默认 client.query 实现
    mockClientQuery.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK") || sql.includes("SET LOCAL")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT 1 FROM wiki_page WHERE id")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO wiki_page")) {
        return { rows: [{ id: NEW_GOAL_PAGE_ID }], rowCount: 1 };
      }
      if (sql.includes("SELECT device_id FROM record")) {
        return { rows: [{ device_id: "dev-1" }] };
      }
      if (sql.includes("INSERT INTO todo")) {
        return { rows: [{ id: "goal-new" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE record SET compile_status")) {
        return { rows: [], rowCount: 1 };
      }
      // 查询 page created_by
      if (sql.includes("SELECT created_by")) {
        return { rows: [{ created_by: "ai" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

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

      // 验证创建了 goal page（INSERT INTO wiki_page 包含 page_type 和 'goal'）
      const insertPageCalls = mockClientQuery.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === "string" &&
          call[0].includes("INSERT INTO wiki_page") &&
          !call[0].includes("wiki_page_record") &&
          call[0].includes("page_type"),
      );
      expect(insertPageCalls.length).toBeGreaterThanOrEqual(1);

      // 验证 SQL 或参数中含 'goal'（page_type）和 'ai'（created_by）
      const pageInsert = insertPageCalls[0];
      const sqlAndParams = pageInsert[0] + JSON.stringify(pageInsert[1] ?? []);
      expect(sqlAndParams).toContain("goal");
      expect(sqlAndParams).toContain("ai");

      // 验证创建了 todo（INSERT INTO todo）并且 wiki_page_id 指向新 page
      const insertTodoCalls = mockClientQuery.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === "string" &&
          call[0].includes("INSERT INTO todo"),
      );
      expect(insertTodoCalls.length).toBeGreaterThanOrEqual(1);
      // wiki_page_id 应该指向新创建的 goal page
      expect(insertTodoCalls[0][1]).toContain(NEW_GOAL_PAGE_ID);
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

      // 应创建 wiki_page 和 todo，todo 的 wiki_page_id 指向新 page
      const insertTodoCalls = mockClientQuery.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === "string" &&
          call[0].includes("INSERT INTO todo"),
      );
      expect(insertTodoCalls.length).toBe(1);
      expect(insertTodoCalls[0][1]).toContain(NEW_GOAL_PAGE_ID);
    });
  });

  // ── Phase 14.7: split_page 分级授权 ──

  describe("split_page_authorization", () => {
    it("should_execute_split_directly_when_page_created_by_ai", async () => {
      // AI 创建的 page → 直接执行
      mockCanAiModifyStructure.mockReturnValue(true);
      // 查询 page 时返回 created_by='ai'
      mockClientQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK") || sql.includes("SET LOCAL")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT") && sql.includes("created_by") && sql.includes("wiki_page")) {
          return { rows: [{ created_by: "ai" }], rowCount: 1 };
        }
        if (sql.includes("SELECT 1 FROM wiki_page WHERE id")) {
          return { rows: [{ "1": 1 }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO wiki_page")) {
          return { rows: [{ id: "child-page-id" }], rowCount: 1 };
        }
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

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
    });

    it("should_create_suggestion_instead_of_split_when_page_created_by_user", async () => {
      // 用户创建的 page → 创建 suggestion
      mockCanAiModifyStructure.mockReturnValue(false);
      mockClientQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK") || sql.includes("SET LOCAL")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT") && sql.includes("created_by") && sql.includes("wiki_page")) {
          return { rows: [{ created_by: "user" }], rowCount: 1 };
        }
        if (sql.includes("SELECT 1 FROM wiki_page WHERE id")) {
          return { rows: [{ "1": 1 }], rowCount: 1 };
        }
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

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
      mockClientQuery.mockImplementation((sql: string) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK") || sql.includes("SET LOCAL")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT") && sql.includes("created_by") && sql.includes("wiki_page")) {
          return { rows: [{ created_by: "ai" }], rowCount: 1 };
        }
        if (sql.includes("SELECT 1 FROM wiki_page WHERE id")) {
          return { rows: [{ "1": 1 }], rowCount: 1 };
        }
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

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
    });

    it("should_create_suggestion_instead_of_merge_when_source_page_created_by_user", async () => {
      mockCanAiModifyStructure.mockReturnValue(false);
      mockClientQuery.mockImplementation((sql: string) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK") || sql.includes("SET LOCAL")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT") && sql.includes("created_by") && sql.includes("wiki_page")) {
          return { rows: [{ created_by: "user" }], rowCount: 1 };
        }
        if (sql.includes("SELECT 1 FROM wiki_page WHERE id")) {
          return { rows: [{ "1": 1 }], rowCount: 1 };
        }
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

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
