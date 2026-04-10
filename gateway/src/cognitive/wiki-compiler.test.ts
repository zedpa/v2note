import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 所有外部依赖 ──

const mockFindPendingCompile = vi.fn();
const mockFindByUser = vi.fn();
const mockFindById = vi.fn();
const mockUpdateCompileStatus = vi.fn();
const mockWikiPageFindByUser = vi.fn();
const mockWikiPageFindById = vi.fn();
const mockWikiPageCreate = vi.fn();
const mockWikiPageUpdate = vi.fn();
const mockWikiPageUpdateStatus = vi.fn();
const mockWikiPageFindByParent = vi.fn();
const mockGoalCreate = vi.fn();
const mockGoalUpdate = vi.fn();
const mockGoalFindByUser = vi.fn();
const mockChatCompletion = vi.fn();
const mockGetEmbedding = vi.fn();
const mockBuildCompilePrompt = vi.fn();

// DB pool mock
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPoolConnect = vi.fn();
const mockPoolQuery = vi.fn();

vi.mock("../db/pool.js", () => ({
  getPool: () => ({
    connect: () => mockPoolConnect(),
    query: (...args: any[]) => mockPoolQuery(...args),
  }),
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../db/repositories/record.js", () => ({
  findPendingCompile: (...args: any[]) => mockFindPendingCompile(...args),
  updateCompileStatus: (...args: any[]) => mockUpdateCompileStatus(...args),
}));

vi.mock("../db/repositories/wiki-page.js", () => ({
  findByUser: (...args: any[]) => mockWikiPageFindByUser(...args),
  findById: (...args: any[]) => mockWikiPageFindById(...args),
  create: (...args: any[]) => mockWikiPageCreate(...args),
  update: (...args: any[]) => mockWikiPageUpdate(...args),
  updateStatus: (...args: any[]) => mockWikiPageUpdateStatus(...args),
  findByParent: (...args: any[]) => mockWikiPageFindByParent(...args),
}));

vi.mock("../db/repositories/goal.js", () => ({
  create: (...args: any[]) => mockGoalCreate(...args),
  update: (...args: any[]) => mockGoalUpdate(...args),
  findByUser: (...args: any[]) => mockGoalFindByUser(...args),
}));

vi.mock("../ai/provider.js", () => ({
  chatCompletion: (...args: any[]) => mockChatCompletion(...args),
}));

vi.mock("../memory/embeddings.js", () => ({
  getEmbedding: (...args: any[]) => mockGetEmbedding(...args),
}));

vi.mock("./wiki-compile-prompt.js", () => ({
  buildCompilePrompt: (...args: any[]) => mockBuildCompilePrompt(...args),
}));

vi.mock("../lib/tz.js", () => ({
  today: () => "2026-04-09",
  now: () => new Date("2026-04-09T10:00:00+08:00"),
}));

import {
  compileWikiForUser,
  parseCompileResponse,
  cosineSimilarity,
  executeInstructions,
  type CompileInstructions,
  type CompileResult,
} from "./wiki-compiler.js";

describe("wiki-compiler", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 默认 pool.connect() 返回可用的 client
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });

    // advisory lock 默认获取成功
    mockClientQuery.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes("pg_try_advisory_lock")) {
        return { rows: [{ pg_try_advisory_lock: true }] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        return { rows: [{ pg_advisory_unlock: true }] };
      }
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO wiki_page")) {
        return { rows: [{ id: "new-page-id" }] };
      }
      if (sql.includes("SELECT device_id FROM record")) {
        return { rows: [{ device_id: "dev-1" }] };
      }
      return { rows: [], rowCount: 0 };
    });

    // 默认 prompt builder
    mockBuildCompilePrompt.mockReturnValue({
      system: "test system prompt",
      user: "test user prompt",
    });

    // 默认 embedding
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  // ── 场景 4: 空记录跳过 ──

  describe("should_return_empty_result_when_no_pending_records", () => {
    it("should_skip_compilation_when_no_pending_records", async () => {
      mockFindPendingCompile.mockResolvedValue([]);

      const result = await compileWikiForUser("user-1");

      expect(result.records_compiled).toBe(0);
      expect(result.pages_created).toBe(0);
      expect(result.pages_updated).toBe(0);
      expect(mockChatCompletion).not.toHaveBeenCalled();
    });
  });

  // ── 场景 7: 并发锁 ──

  describe("should_skip_when_concurrent_compilation_running", () => {
    it("should_return_empty_when_lock_not_acquired", async () => {
      // advisory lock 获取失败
      mockClientQuery.mockImplementation((sql: string) => {
        if (sql.includes("pg_try_advisory_lock")) {
          return { rows: [{ pg_try_advisory_lock: false }] };
        }
        return { rows: [] };
      });

      const result = await compileWikiForUser("user-1");

      expect(result.records_compiled).toBe(0);
      expect(mockFindPendingCompile).not.toHaveBeenCalled();
    });
  });

  // ── 场景 1: 冷启动编译 ──

  describe("cold_start_compilation", () => {
    it("should_set_cold_start_flag_when_no_wiki_pages", async () => {
      // 有 pending record
      mockFindPendingCompile.mockResolvedValue([
        { id: "rec-1", source_type: "think", created_at: "2026-04-09" },
        { id: "rec-2", source_type: "think", created_at: "2026-04-09" },
        { id: "rec-3", source_type: "think", created_at: "2026-04-09" },
      ]);

      // 无 wiki page（冷启动）
      mockWikiPageFindByUser.mockResolvedValue([]);

      // Mock loadRecordTexts 需要的 DB query
      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      // AI 返回创建 L3 page 指令
      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [],
          create_pages: [
            {
              title: "工作与生活",
              content: "## 核心认知\n初始编译",
              summary: "综合主题",
              parent_id: null,
              level: 3,
              domain: null,
              record_ids: ["rec-1", "rec-2", "rec-3"],
            },
          ],
          merge_pages: [],
          split_page: [],
          goal_sync: [],
        }),
      });

      const result = await compileWikiForUser("user-1");

      // 验证 buildCompilePrompt 被调用时 isColdStart = true
      expect(mockBuildCompilePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ isColdStart: true }),
      );
      expect(result.pages_created).toBe(1);
      expect(result.records_compiled).toBe(3);
    });
  });

  // ── 场景 2: 增量更新 ──

  describe("incremental_update", () => {
    it("should_update_existing_page_when_record_matches", async () => {
      mockFindPendingCompile.mockResolvedValue([
        { id: "rec-1", source_type: "think", created_at: "2026-04-09" },
      ]);

      mockWikiPageFindByUser.mockResolvedValue([
        {
          id: "page-1",
          user_id: "user-1",
          title: "供应链",
          content: "## 核心认知\n铝价波动",
          summary: "供应链相关",
          level: 3,
          domain: "工作",
          embedding: [0.1, 0.2, 0.3],
          status: "active",
        },
      ]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [
            {
              page_id: "page-1",
              new_content: "## 核心认知\n铝价波动，今天又涨了 [→ rec:rec-1]",
              new_summary: "铝价持续上涨",
              add_record_ids: ["rec-1"],
            },
          ],
          create_pages: [],
          merge_pages: [],
          split_page: [],
          goal_sync: [],
        }),
      });

      const result = await compileWikiForUser("user-1");

      expect(result.pages_updated).toBe(1);
      expect(result.records_compiled).toBe(1);
    });
  });

  // ── 场景 3: 新主题创建 ──

  describe("new_topic_creation", () => {
    it("should_create_new_page_when_record_not_matching_any_page", async () => {
      mockFindPendingCompile.mockResolvedValue([
        { id: "rec-1", source_type: "think", created_at: "2026-04-09" },
      ]);

      mockWikiPageFindByUser.mockResolvedValue([]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [],
          create_pages: [
            {
              title: "运动健康",
              content: "## 核心认知\n开始跑步 [→ rec:rec-1]",
              summary: "健康运动记录",
              parent_id: null,
              level: 3,
              domain: "生活",
              record_ids: ["rec-1"],
            },
          ],
          merge_pages: [],
          split_page: [],
          goal_sync: [],
        }),
      });

      const result = await compileWikiForUser("user-1");

      expect(result.pages_created).toBe(1);
    });
  });

  // ── 场景 5: AI 解析失败 ──

  describe("ai_parse_failure", () => {
    it("should_not_execute_writes_when_ai_returns_invalid_json", async () => {
      mockFindPendingCompile.mockResolvedValue([
        { id: "rec-1", source_type: "think", created_at: "2026-04-09" },
      ]);

      mockWikiPageFindByUser.mockResolvedValue([]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      // AI 返回无效 JSON
      mockChatCompletion.mockResolvedValue({
        content: "这不是 JSON 内容，我无法生成编译指令。",
      });

      const result = await compileWikiForUser("user-1");

      // 不应执行任何写入
      expect(result.records_compiled).toBe(0);
      expect(result.pages_created).toBe(0);
      // AI 被调用了但解析失败
      expect(mockChatCompletion).toHaveBeenCalled();
    });
  });

  // ── 场景 6: DB 事务回滚 ──

  describe("db_transaction_rollback", () => {
    it("should_rollback_all_changes_when_instruction_execution_fails", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      // BEGIN 成功，但 UPDATE 失败
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes("BEGIN")) return Promise.resolve({ rows: [] });
        if (sql.includes("ROLLBACK")) return Promise.resolve({ rows: [] });
        if (sql.includes("COMMIT")) return Promise.resolve({ rows: [] });
        if (sql.includes("UPDATE wiki_page SET content")) {
          throw new Error("DB write failed");
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      // 直接调用 executeInstructions
      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [
          {
            page_id: "page-1",
            new_content: "new content",
            new_summary: "new summary",
            add_record_ids: ["rec-1"],
          },
        ],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [],
      };

      await expect(
        executeInstructions(instructions, "user-1", ["rec-1"]),
      ).rejects.toThrow("DB write failed");

      // 验证 ROLLBACK 被调用
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ── 场景 9: goal_sync 创建 ──

  describe("goal_sync_create", () => {
    it("should_create_goal_with_wiki_page_id_when_goal_sync_create", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT")) return { rows: [] };
        if (sql.includes("SELECT device_id")) {
          return { rows: [{ device_id: "dev-1" }] };
        }
        if (sql.includes("INSERT INTO todo")) {
          return { rows: [{ id: "goal-new" }], rowCount: 1 };
        }
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [
          {
            action: "create",
            title: "Q2 完成产品发布",
            status: "active",
            wiki_page_id: "page-1",
          },
        ],
      };

      const result = await executeInstructions(instructions, "user-1", ["rec-1"]);

      // 验证 INSERT INTO todo 被调用
      const insertCall = mockClient.query.mock.calls.find(
        (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO todo"),
      );
      expect(insertCall).toBeDefined();
      // 验证 wiki_page_id 参数
      expect(insertCall![1]).toContain("page-1");
      expect(insertCall![1]).toContain("Q2 完成产品发布");

      expect(result.records_compiled).toBe(1);
    });
  });

  // ── 场景 10: Page 拆分 ──

  describe("page_split", () => {
    it("should_create_child_pages_and_update_parent_when_split", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      const queryResults: Record<string, any> = {};
      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT")) return { rows: [] };
        if (sql.includes("UPDATE wiki_page SET content")) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO wiki_page")) {
          return { rows: [{ id: "child-page-id" }], rowCount: 1 };
        }
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [
          {
            source_id: "page-1",
            new_parent_content: "## 核心认知\n拆分后的摘要\n## 子页索引\n- 供应链\n- 产品推广",
            children: [
              {
                title: "供应链管理",
                content: "## 核心认知\n铝价波动详情",
                summary: "供应链管理相关",
              },
              {
                title: "产品推广",
                content: "## 核心认知\n推广策略",
                summary: "产品推广相关",
              },
            ],
          },
        ],
        goal_sync: [],
      };

      const result = await executeInstructions(instructions, "user-1", ["rec-1"]);

      expect(result.pages_split).toBe(1);

      // 验证父 page 被更新
      const updateCall = mockClient.query.mock.calls.find(
        (call: any[]) => typeof call[0] === "string" && call[0].includes("UPDATE wiki_page SET content"),
      );
      expect(updateCall).toBeDefined();

      // 验证子 page 被创建（2个子 page）
      const insertCalls = mockClient.query.mock.calls.filter(
        (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO wiki_page ("),
      );
      expect(insertCalls.length).toBe(2);

      // 验证 record 关联迁移到子 page（每个子 page 一条 INSERT INTO wiki_page_record）
      const recordMigrateCalls = mockClient.query.mock.calls.filter(
        (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO wiki_page_record"),
      );
      expect(recordMigrateCalls.length).toBe(2);
    });
  });

  // ── parseCompileResponse 单独测试 ──

  describe("parseCompileResponse", () => {
    it("should_parse_valid_json", () => {
      const json = JSON.stringify({
        update_pages: [{ page_id: "p1", new_content: "c", new_summary: "s", add_record_ids: [] }],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [],
      });

      const result = parseCompileResponse(json);

      expect(result.update_pages).toHaveLength(1);
      expect(result.update_pages[0].page_id).toBe("p1");
    });

    it("should_extract_json_from_markdown_code_block", () => {
      const raw = '```json\n{"update_pages":[],"create_pages":[],"merge_pages":[],"split_page":[],"goal_sync":[]}\n```';

      const result = parseCompileResponse(raw);

      expect(result.update_pages).toEqual([]);
    });

    it("should_throw_on_invalid_json", () => {
      expect(() => parseCompileResponse("not json at all")).toThrow();
    });

    it("should_normalize_missing_fields_to_empty_arrays", () => {
      const json = JSON.stringify({ update_pages: [{ page_id: "p1" }] });

      const result = parseCompileResponse(json);

      expect(result.create_pages).toEqual([]);
      expect(result.merge_pages).toEqual([]);
      expect(result.split_page).toEqual([]);
      expect(result.goal_sync).toEqual([]);
    });
  });

  // ── cosineSimilarity 测试 ──

  describe("cosineSimilarity", () => {
    it("should_return_1_for_identical_vectors", () => {
      const a = [1, 2, 3];
      const sim = cosineSimilarity(a, a);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    it("should_return_0_for_orthogonal_vectors", () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it("should_return_0_for_empty_vectors", () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it("should_return_0_for_different_length_vectors", () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it("should_handle_negative_similarity", () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
    });
  });

  // ── merge_pages 测试 ──

  describe("merge_pages", () => {
    it("should_mark_source_as_merged_and_migrate_records", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT")) return { rows: [] };
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [
          {
            source_id: "page-old",
            target_id: "page-target",
            reason: "主题高度重叠",
          },
        ],
        split_page: [],
        goal_sync: [],
      };

      const result = await executeInstructions(instructions, "user-1", ["rec-1"]);

      expect(result.pages_merged).toBe(1);

      // 验证 source page 状态更新为 merged
      const statusUpdateCall = mockClient.query.mock.calls.find(
        (call: any[]) =>
          typeof call[0] === "string" &&
          call[0].includes("status = 'merged'") &&
          call[0].includes("merged_into"),
      );
      expect(statusUpdateCall).toBeDefined();

      // 验证 record 关联迁移
      const recordMigrateCall = mockClient.query.mock.calls.find(
        (call: any[]) =>
          typeof call[0] === "string" &&
          call[0].includes("UPDATE wiki_page_record"),
      );
      expect(recordMigrateCall).toBeDefined();

      // 验证 goal 关联迁移
      const goalMigrateCall = mockClient.query.mock.calls.find(
        (call: any[]) =>
          typeof call[0] === "string" &&
          call[0].includes("UPDATE todo SET wiki_page_id"),
      );
      expect(goalMigrateCall).toBeDefined();
    });
  });
});
