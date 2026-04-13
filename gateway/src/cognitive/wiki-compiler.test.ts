import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 所有外部依赖 ──

const mockFindPendingCompile = vi.fn();
const mockFindByUser = vi.fn();
const mockFindById = vi.fn();
const mockUpdateCompileStatus = vi.fn();
const mockCountUndigested = vi.fn();
const mockWikiPageFindByUser = vi.fn();
const mockWikiPageFindById = vi.fn();
const mockWikiPageCreate = vi.fn();
const mockWikiPageUpdate = vi.fn();
const mockWikiPageUpdateStatus = vi.fn();
const mockWikiPageFindByParent = vi.fn();
const mockWikiPageExists = vi.fn();
const mockGoalCreate = vi.fn();
const mockGoalUpdate = vi.fn();
const mockGoalFindByUser = vi.fn();
const mockChatCompletion = vi.fn();
const mockBuildCompilePrompt = vi.fn();
const mockFindPagesByRecords = vi.fn();
const mockWikiPageRecordLink = vi.fn();
const mockWikiPageRecordTransferAll = vi.fn();
const mockWikiPageRecordInheritAll = vi.fn();
const mockWikiPageLinkCreateLink = vi.fn();
const mockTodoCreate = vi.fn();
const mockTodoUpdate = vi.fn();
const mockTodoTransferWikiPageRef = vi.fn();

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
  countUndigested: (...args: any[]) => mockCountUndigested(...args),
}));

vi.mock("../db/repositories/wiki-page.js", () => ({
  findByUser: (...args: any[]) => mockWikiPageFindByUser(...args),
  findById: (...args: any[]) => mockWikiPageFindById(...args),
  create: (...args: any[]) => mockWikiPageCreate(...args),
  update: (...args: any[]) => mockWikiPageUpdate(...args),
  updateStatus: (...args: any[]) => mockWikiPageUpdateStatus(...args),
  findByParent: (...args: any[]) => mockWikiPageFindByParent(...args),
  exists: (...args: any[]) => mockWikiPageExists(...args),
}));

vi.mock("../db/repositories/goal.js", () => ({
  create: (...args: any[]) => mockGoalCreate(...args),
  update: (...args: any[]) => mockGoalUpdate(...args),
  findByUser: (...args: any[]) => mockGoalFindByUser(...args),
}));

vi.mock("../ai/provider.js", () => ({
  chatCompletion: (...args: any[]) => mockChatCompletion(...args),
}));

vi.mock("../db/repositories/wiki-page-record.js", () => ({
  findPagesByRecords: (...args: any[]) => mockFindPagesByRecords(...args),
  link: (...args: any[]) => mockWikiPageRecordLink(...args),
  transferAll: (...args: any[]) => mockWikiPageRecordTransferAll(...args),
  inheritAll: (...args: any[]) => mockWikiPageRecordInheritAll(...args),
}));

vi.mock("../db/repositories/wiki-page-link.js", () => ({
  createLink: (...args: any[]) => mockWikiPageLinkCreateLink(...args),
}));

const mockTodoFindActiveGoalsByUser = vi.fn();

vi.mock("../db/repositories/todo.js", () => ({
  create: (...args: any[]) => mockTodoCreate(...args),
  update: (...args: any[]) => mockTodoUpdate(...args),
  transferWikiPageRef: (...args: any[]) => mockTodoTransferWikiPageRef(...args),
  findActiveGoalsByUser: (...args: any[]) => mockTodoFindActiveGoalsByUser(...args),
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
  executeInstructions,
  type CompileInstructions,
  type CompileResult,
} from "./wiki-compiler.js";

// 合法 UUID 常量，替代 "page-1" 等假 ID
const PAGE_1   = "00000000-0000-4000-a000-000000000001";
const PAGE_OLD = "00000000-0000-4000-a000-000000000002";
const PAGE_TGT = "00000000-0000-4000-a000-000000000003";
const REC_1    = "10000000-0000-4000-a000-000000000001";
const REC_2    = "10000000-0000-4000-a000-000000000002";
const REC_3    = "10000000-0000-4000-a000-000000000003";

describe("wiki-compiler", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 默认 pool.connect() 返回可用的 client
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });

    mockClientQuery.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK") || sql.includes("SET LOCAL")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO wiki_page")) {
        return { rows: [{ id: "new-page-id" }], rowCount: 1 };
      }
      if (sql.includes("SELECT device_id FROM record")) {
        return { rows: [{ device_id: "dev-1" }] };
      }
      // 存在性检查默认返回存在
      if (sql.includes("SELECT 1 FROM wiki_page WHERE id")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    // 默认 countUndigested 返回 0
    mockCountUndigested.mockResolvedValue(0);

    // 默认 prompt builder
    mockBuildCompilePrompt.mockReturnValue({
      system: "test system prompt",
      user: "test user prompt",
    });

    // 默认 wiki_page_record 查询返回空（无关联）
    mockFindPagesByRecords.mockResolvedValue([]);

    // ── repo mock 默认值（executeInstructions 改用 repo 调用后需要）──
    mockWikiPageExists.mockResolvedValue(true);
    mockWikiPageUpdate.mockResolvedValue(undefined);
    mockWikiPageCreate.mockResolvedValue({ id: "new-page-id" });
    mockWikiPageFindById.mockResolvedValue({ id: "page-1", level: 3, created_by: "ai" });
    mockWikiPageRecordLink.mockResolvedValue(undefined);
    mockWikiPageRecordTransferAll.mockResolvedValue(0);
    mockWikiPageRecordInheritAll.mockResolvedValue(0);
    mockWikiPageLinkCreateLink.mockResolvedValue({ id: "link-1" });
    mockTodoCreate.mockResolvedValue({ id: "todo-1" });
    mockTodoUpdate.mockResolvedValue(undefined);
    mockTodoTransferWikiPageRef.mockResolvedValue(0);
    mockTodoFindActiveGoalsByUser.mockResolvedValue([]);
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
      // 模拟并发：第一次调用会阻塞在 findPendingCompile 上，
      // 此时第二次调用应命中内存锁直接返回空
      let resolveFirst: () => void;
      const blockFirst = new Promise<void>(r => { resolveFirst = r; });

      mockFindPendingCompile.mockImplementation(async () => {
        await blockFirst;
        return [];
      });

      const first = compileWikiForUser("user-1");
      // 等待事件循环让 first 进入 findPendingCompile
      await new Promise(r => setTimeout(r, 10));

      const second = await compileWikiForUser("user-1");

      // 第二次调用应被内存锁拦截
      expect(second.records_compiled).toBe(0);

      // 释放第一次调用
      resolveFirst!();
      await first;
    });
  });

  // ── 场景 1: 冷启动编译 ──

  describe("cold_start_compilation", () => {
    it("should_set_cold_start_flag_when_no_wiki_pages", async () => {
      // 有 pending record
      mockFindPendingCompile.mockResolvedValue([
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
        { id: REC_2, source_type: "think", created_at: "2026-04-09" },
        { id: REC_3, source_type: "think", created_at: "2026-04-09" },
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
              record_ids: [REC_1, REC_2, REC_3],
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
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
      ]);

      // wiki_page_record 关联：REC_1 → PAGE_1
      mockFindPagesByRecords.mockResolvedValue([
        { wiki_page_id: PAGE_1, record_id: REC_1, added_at: "2026-04-09T10:00:00Z" },
      ]);

      mockWikiPageFindByUser.mockResolvedValue([
        {
          id: PAGE_1,
          user_id: "user-1",
          title: "供应链",
          content: "## 核心认知\n铝价波动",
          summary: "供应链相关",
          level: 3,
          domain: "工作",
          status: "active",
        },
      ]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [
            {
              page_id: PAGE_1,
              new_content: `## 核心认知\n铝价波动，今天又涨了 [→ rec:${REC_1}]`,
              new_summary: "铝价持续上涨",
              add_record_ids: [REC_1],
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
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
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
              content: `## 核心认知\n开始跑步 [→ rec:${REC_1}]`,
              summary: "健康运动记录",
              parent_id: null,
              level: 3,
              domain: "生活",
              record_ids: [REC_1],
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
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
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

      // BEGIN/COMMIT/ROLLBACK/SET LOCAL 直接由 client.query 处理
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes("BEGIN") || sql.includes("SET LOCAL")) return Promise.resolve({ rows: [] });
        if (sql.includes("ROLLBACK")) return Promise.resolve({ rows: [] });
        if (sql.includes("COMMIT")) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      // 存在性检查通过，但 update 失败
      mockWikiPageExists.mockResolvedValue(true);
      mockWikiPageUpdate.mockRejectedValue(new Error("DB write failed"));

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [
          {
            page_id: PAGE_1,
            new_content: "new content",
            new_summary: "new summary",
            add_record_ids: [REC_1],
          },
        ],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [],
      };

      await expect(
        executeInstructions(instructions, "user-1", [REC_1]),
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
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL")) return { rows: [] };
        if (sql.includes("SELECT device_id")) {
          return { rows: [{ device_id: "dev-1" }] };
        }
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      // wiki page 存在
      mockWikiPageExists.mockResolvedValue(true);
      // todo 创建成功
      mockTodoCreate.mockResolvedValue({ id: "goal-new" });

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
            wiki_page_id: PAGE_1,
          },
        ],
      };

      const result = await executeInstructions(instructions, "user-1", [REC_1]);

      // 验证 todoRepo.create 被调用并包含正确参数
      expect(mockTodoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Q2 完成产品发布",
          wiki_page_id: PAGE_1,
          level: 1,
          category: "emerged",
        }),
        mockClient,
      );

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

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL")) return { rows: [] };
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      // page 存在
      mockWikiPageExists.mockResolvedValue(true);
      // findById 返回 AI 创建的 page（canAiModifyStructure 需要 created_by: "ai"）
      mockWikiPageFindById.mockResolvedValue({
        id: PAGE_1, level: 3, domain: "工作", created_by: "ai",
      });
      // update 成功
      mockWikiPageUpdate.mockResolvedValue(undefined);
      // create 返回子 page
      let childIdx = 0;
      mockWikiPageCreate.mockImplementation(() => ({
        id: `child-page-${++childIdx}`,
      }));
      // inheritAll 成功
      mockWikiPageRecordInheritAll.mockResolvedValue(3);

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [
          {
            source_id: PAGE_1,
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

      const result = await executeInstructions(instructions, "user-1", [REC_1]);

      expect(result.pages_split).toBe(1);

      // 验证父 page 被更新
      expect(mockWikiPageUpdate).toHaveBeenCalledWith(
        PAGE_1,
        expect.objectContaining({ content: expect.stringContaining("拆分后的摘要") }),
        mockClient,
      );

      // 验证子 page 被创建（2个子 page）
      expect(mockWikiPageCreate).toHaveBeenCalledTimes(2);

      // 验证 record 关联继承（每个子 page 一次 inheritAll）
      expect(mockWikiPageRecordInheritAll).toHaveBeenCalledTimes(2);
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

  // ── merge_pages 测试 ──

  describe("merge_pages", () => {
    it("should_mark_source_as_merged_and_migrate_records", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL")) return { rows: [] };
        if (sql.includes("UPDATE record SET compile_status")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      // 两个 page 都存在
      mockWikiPageExists.mockResolvedValue(true);
      // findById 返回 AI 创建的 page
      mockWikiPageFindById.mockResolvedValue({ id: PAGE_OLD, created_by: "ai" });
      // update 成功
      mockWikiPageUpdate.mockResolvedValue(undefined);
      // transferAll 成功
      mockWikiPageRecordTransferAll.mockResolvedValue(5);
      // transferWikiPageRef 成功
      mockTodoTransferWikiPageRef.mockResolvedValue(1);

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [
          {
            source_id: PAGE_OLD,
            target_id: PAGE_TGT,
            reason: "主题高度重叠",
          },
        ],
        split_page: [],
        goal_sync: [],
      };

      const result = await executeInstructions(instructions, "user-1", [REC_1]);

      expect(result.pages_merged).toBe(1);

      // 验证 source page 状态更新为 merged（通过 repo.update）
      expect(mockWikiPageUpdate).toHaveBeenCalledWith(
        PAGE_OLD,
        expect.objectContaining({ status: "merged", merged_into: PAGE_TGT }),
        mockClient,
      );

      // 验证 record 关联迁移（通过 repo.transferAll）
      expect(mockWikiPageRecordTransferAll).toHaveBeenCalledWith(PAGE_OLD, PAGE_TGT, mockClient);

      // 验证 goal 关联迁移（通过 todoRepo.transferWikiPageRef）
      expect(mockTodoTransferWikiPageRef).toHaveBeenCalledWith(PAGE_OLD, PAGE_TGT, mockClient);
    });
  });

  // ── Phase 14.12: 去除 Embedding 依赖 ──

  describe("phase_14_12_remove_embedding_dependency", () => {
    it("should_route_records_via_wiki_page_record_not_embedding", async () => {
      mockFindPendingCompile.mockResolvedValue([
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
      ]);

      // wiki_page_record 关联：REC_1 → PAGE_1
      mockFindPagesByRecords.mockResolvedValue([
        { wiki_page_id: PAGE_1, record_id: REC_1, added_at: "2026-04-09T10:00:00Z" },
      ]);

      mockWikiPageFindByUser.mockResolvedValue([
        {
          id: PAGE_1,
          user_id: "user-1",
          title: "供应链",
          content: "## 核心认知\n铝价波动",
          summary: "供应链相关",
          level: 3,
          domain: "工作",
          status: "active",
        },
      ]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [
            {
              page_id: PAGE_1,
              new_content: "## 核心认知\n铝价波动更新",
              new_summary: "供应链更新",
              add_record_ids: [REC_1],
            },
          ],
          create_pages: [],
          merge_pages: [],
          split_page: [],
          goal_sync: [],
        }),
      });

      const result = await compileWikiForUser("user-1");

      // 验证通过 wiki_page_record 路由而非 embedding
      expect(mockFindPagesByRecords).toHaveBeenCalledWith([REC_1]);
      expect(result.pages_updated).toBe(1);
      expect(result.records_compiled).toBe(1);

      // 验证 matchedPages 传给 prompt 中包含了关联的 page
      expect(mockBuildCompilePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          matchedPages: expect.arrayContaining([
            expect.objectContaining({ id: PAGE_1, title: "供应链" }),
          ]),
        }),
      );
    });

    it("should_compile_successfully_when_records_have_no_page_association", async () => {
      // cold start 场景：record 没有任何 page 关联
      mockFindPendingCompile.mockResolvedValue([
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
      ]);

      // 无 wiki_page_record 关联
      mockFindPagesByRecords.mockResolvedValue([]);

      mockWikiPageFindByUser.mockResolvedValue([]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [],
          create_pages: [
            {
              title: "新主题",
              content: "## 核心认知\n初始内容",
              summary: "新主题摘要",
              parent_id: null,
              level: 3,
              domain: null,
              record_ids: [REC_1],
            },
          ],
          merge_pages: [],
          split_page: [],
          goal_sync: [],
        }),
      });

      const result = await compileWikiForUser("user-1");

      expect(result.pages_created).toBe(1);
      expect(result.records_compiled).toBe(1);
      // prompt 中 matchedPages 应为空（无关联 page）
      expect(mockBuildCompilePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          matchedPages: [],
          isColdStart: true,
        }),
      );
    });

    it("should_not_call_getEmbedding_during_compilation", async () => {
      mockFindPendingCompile.mockResolvedValue([
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
      ]);

      mockFindPagesByRecords.mockResolvedValue([]);
      mockWikiPageFindByUser.mockResolvedValue([]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [],
          create_pages: [],
          merge_pages: [],
          split_page: [],
          goal_sync: [],
        }),
      });

      await compileWikiForUser("user-1");

      expect(mockFindPagesByRecords).toHaveBeenCalled();
    });

    it("should_pass_existing_goals_to_prompt_when_goals_exist", async () => {
      mockFindPendingCompile.mockResolvedValue([
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
      ]);

      mockFindPagesByRecords.mockResolvedValue([]);
      mockWikiPageFindByUser.mockResolvedValue([
        { id: PAGE_1, user_id: "user-1", title: "工作", content: "", summary: "工作", level: 3, domain: "工作", status: "active", page_type: "topic" },
      ]);

      // 已有目标
      mockTodoFindActiveGoalsByUser.mockResolvedValue([
        { id: "goal-1", text: "学英语", status: "active", wiki_page_id: "wp-1" },
        { id: "goal-2", text: "减重10kg", status: "progressing", wiki_page_id: null },
      ]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [], create_pages: [], merge_pages: [],
          split_page: [], goal_sync: [],
        }),
      });

      await compileWikiForUser("user-1");

      // 验证 prompt 包含 existingGoals
      expect(mockBuildCompilePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          existingGoals: [
            { id: "goal-1", title: "学英语", status: "active", wiki_page_id: "wp-1" },
            { id: "goal-2", title: "减重10kg", status: "progressing", wiki_page_id: null },
          ],
        }),
      );
    });

    it("should_pass_page_type_in_allPageIndex_when_pages_have_type", async () => {
      mockFindPendingCompile.mockResolvedValue([
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
      ]);

      mockFindPagesByRecords.mockResolvedValue([]);
      mockWikiPageFindByUser.mockResolvedValue([
        { id: PAGE_1, user_id: "user-1", title: "工作", content: "", summary: "工作", level: 3, domain: "工作", status: "active", page_type: "topic" },
        { id: PAGE_OLD, user_id: "user-1", title: "学英语", content: "", summary: "英语", level: 2, domain: "学习", status: "active", page_type: "goal" },
      ]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [], create_pages: [], merge_pages: [],
          split_page: [], goal_sync: [],
        }),
      });

      await compileWikiForUser("user-1");

      expect(mockBuildCompilePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          allPageIndex: expect.arrayContaining([
            expect.objectContaining({ id: PAGE_1, page_type: "topic" }),
            expect.objectContaining({ id: PAGE_OLD, page_type: "goal" }),
          ]),
        }),
      );
    });

    it("should_load_matched_pages_by_page_ids", async () => {
      // 验证 loadMatchedPages 通过 page ID 加载（非相似度排序）
      mockFindPendingCompile.mockResolvedValue([
        { id: REC_1, source_type: "think", created_at: "2026-04-09" },
        { id: REC_2, source_type: "think", created_at: "2026-04-09" },
      ]);

      // 两个 record 关联同一个 page
      mockFindPagesByRecords.mockResolvedValue([
        { wiki_page_id: PAGE_1, record_id: REC_1, added_at: "2026-04-09T10:00:00Z" },
        { wiki_page_id: PAGE_1, record_id: REC_2, added_at: "2026-04-09T11:00:00Z" },
      ]);

      mockWikiPageFindByUser.mockResolvedValue([
        {
          id: PAGE_1,
          user_id: "user-1",
          title: "供应链",
          content: "## 核心认知\n铝价波动",
          summary: "供应链相关",
          level: 3,
          domain: "工作",
          status: "active",
        },
      ]);

      const { query: poolQuery } = await import("../db/pool.js");
      (poolQuery as any).mockResolvedValue([]);

      mockChatCompletion.mockResolvedValue({
        content: JSON.stringify({
          update_pages: [],
          create_pages: [],
          merge_pages: [],
          split_page: [],
          goal_sync: [],
        }),
      });

      await compileWikiForUser("user-1");

      // 验证 matchedPages 包含去重后的 page（不重复加载）
      expect(mockBuildCompilePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          matchedPages: [
            expect.objectContaining({ id: PAGE_1, title: "供应链" }),
          ],
        }),
      );
    });
  });

  // ── fix-goal-quality: goal_sync 去重 + 层级组织 ──

  describe("goal_sync_dedup (fix-goal-quality)", () => {
    const GOAL_PAGE_ID = "20000000-0000-4000-a000-000000000001";
    const PARENT_PAGE = "30000000-0000-4000-a000-000000000001";

    it("should_skip_goal_create_when_duplicate_title_exists", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL")) return { rows: [] };
        if (sql.includes("UPDATE record SET compile_status")) return { rows: [], rowCount: 1 };
        // DB 去重查询：已有同标题 todo
        if (sql.includes("SELECT id FROM todo") && sql.includes("TRIM(text)")) {
          return { rows: [{ id: "existing-goal-id" }] };
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
          { action: "create", title: "学英语", status: "active" },
        ],
      };

      await executeInstructions(instructions, "user-1", [REC_1]);

      // todoRepo.create 不应被调用（重复目标被跳过）
      expect(mockTodoCreate).not.toHaveBeenCalled();
      // wiki page 也不应被创建
      expect(mockWikiPageCreate).not.toHaveBeenCalled();
    });

    it("should_create_goal_normally_when_no_duplicate_title", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL")) return { rows: [] };
        if (sql.includes("UPDATE record SET compile_status")) return { rows: [], rowCount: 1 };
        // DB 去重查询：无同标题 todo
        if (sql.includes("SELECT id FROM todo") && sql.includes("TRIM(text)")) {
          return { rows: [] };
        }
        // goal page 标题查重：无同标题 goal page
        if (sql.includes("SELECT id FROM wiki_page") && sql.includes("page_type")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT device_id")) return { rows: [{ device_id: "dev-1" }] };
        return { rows: [], rowCount: 0 };
      });

      mockWikiPageExists.mockResolvedValue(false);
      mockWikiPageCreate.mockResolvedValue({ id: "new-goal-page" });
      mockTodoCreate.mockResolvedValue({ id: "new-goal" });

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [
          { action: "create", title: "学日语", status: "active" },
        ],
      };

      const result = await executeInstructions(instructions, "user-1", [REC_1]);

      expect(mockTodoCreate).toHaveBeenCalledWith(
        expect.objectContaining({ text: "学日语", level: 1 }),
        mockClient,
      );
      expect(mockWikiPageCreate).toHaveBeenCalled();
      expect(result.pages_created).toBe(1);
    });

    it("should_reuse_existing_goal_page_when_same_title_exists", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL")) return { rows: [] };
        if (sql.includes("UPDATE record SET compile_status")) return { rows: [], rowCount: 1 };
        // todo 去重：无重复
        if (sql.includes("SELECT id FROM todo") && sql.includes("TRIM(text)")) {
          return { rows: [] };
        }
        // goal page 标题查重：已有同标题 goal page
        if (sql.includes("SELECT id FROM wiki_page") && sql.includes("page_type")) {
          return { rows: [{ id: GOAL_PAGE_ID }] };
        }
        if (sql.includes("SELECT device_id")) return { rows: [{ device_id: "dev-1" }] };
        return { rows: [], rowCount: 0 };
      });

      // wiki_page_id 为空，但 goal page 通过标题查重找到
      mockTodoCreate.mockResolvedValue({ id: "new-goal" });

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [
          { action: "create", title: "学英语", status: "active" },
        ],
      };

      const result = await executeInstructions(instructions, "user-1", [REC_1]);

      // wikiPageRepo.create 不应被调用（复用已有 goal page）
      expect(mockWikiPageCreate).not.toHaveBeenCalled();
      // todo 应创建并关联到已有 goal page
      expect(mockTodoCreate).toHaveBeenCalledWith(
        expect.objectContaining({ wiki_page_id: GOAL_PAGE_ID }),
        mockClient,
      );
      // 不增加 pages_created 计数
      expect(result.pages_created).toBe(0);
    });

    it("should_mount_goal_page_under_parent_when_parent_page_id_provided", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL")) return { rows: [] };
        if (sql.includes("UPDATE record SET compile_status")) return { rows: [], rowCount: 1 };
        // todo 去重：无重复
        if (sql.includes("SELECT id FROM todo") && sql.includes("TRIM(text)")) {
          return { rows: [] };
        }
        // goal page 标题查重：无同标题
        if (sql.includes("SELECT id FROM wiki_page") && sql.includes("page_type")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT device_id")) return { rows: [{ device_id: "dev-1" }] };
        return { rows: [], rowCount: 0 };
      });

      // parent page 存在，level=3
      mockWikiPageExists.mockResolvedValue(true);
      mockWikiPageFindById.mockResolvedValue({ id: PARENT_PAGE, level: 3, domain: "工作" });
      mockWikiPageCreate.mockResolvedValue({ id: "new-goal-page" });
      mockTodoCreate.mockResolvedValue({ id: "new-goal" });

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [
          {
            action: "create",
            title: "Q2 业绩目标",
            status: "active",
            parent_page_id: PARENT_PAGE,
          },
        ],
      };

      const result = await executeInstructions(instructions, "user-1", [REC_1]);

      // goal page 应创建，挂载到 parent 下，level = parent.level - 1 = 2
      expect(mockWikiPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_id: PARENT_PAGE,
          level: 2,
          page_type: "goal",
        }),
        mockClient,
      );
      expect(result.pages_created).toBe(1);
    });

    it("should_create_goal_page_at_level3_when_no_parent_page_id", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL")) return { rows: [] };
        if (sql.includes("UPDATE record SET compile_status")) return { rows: [], rowCount: 1 };
        // todo 去重：无重复
        if (sql.includes("SELECT id FROM todo") && sql.includes("TRIM(text)")) {
          return { rows: [] };
        }
        // goal page 标题查重：无同标题
        if (sql.includes("SELECT id FROM wiki_page") && sql.includes("page_type")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT device_id")) return { rows: [{ device_id: "dev-1" }] };
        return { rows: [], rowCount: 0 };
      });

      mockWikiPageCreate.mockResolvedValue({ id: "new-goal-page" });
      mockTodoCreate.mockResolvedValue({ id: "new-goal" });

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [
          { action: "create", title: "健身计划", status: "active" },
        ],
      };

      const result = await executeInstructions(instructions, "user-1", [REC_1]);

      // 无 parent_page_id → level=3, parent_id=undefined
      expect(mockWikiPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 3,
          page_type: "goal",
        }),
        mockClient,
      );
      // parent_id 应不存在或为 undefined
      const createCall = mockWikiPageCreate.mock.calls[0][0];
      expect(createCall.parent_id).toBeUndefined();
      expect(result.pages_created).toBe(1);
    });

    it("should_set_goal_page_level_min_1_when_parent_level_is_1", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL")) return { rows: [] };
        if (sql.includes("UPDATE record SET compile_status")) return { rows: [], rowCount: 1 };
        if (sql.includes("SELECT id FROM todo") && sql.includes("TRIM(text)")) return { rows: [] };
        if (sql.includes("SELECT id FROM wiki_page") && sql.includes("page_type")) return { rows: [] };
        if (sql.includes("SELECT device_id")) return { rows: [{ device_id: "dev-1" }] };
        return { rows: [], rowCount: 0 };
      });

      // parent page level=1（最小值边界）
      mockWikiPageExists.mockResolvedValue(true);
      mockWikiPageFindById.mockResolvedValue({ id: PARENT_PAGE, level: 1, domain: "工作" });
      mockWikiPageCreate.mockResolvedValue({ id: "new-goal-page" });
      mockTodoCreate.mockResolvedValue({ id: "new-goal" });

      mockPoolConnect.mockResolvedValue(mockClient);

      const instructions: CompileInstructions = {
        update_pages: [],
        create_pages: [],
        merge_pages: [],
        split_page: [],
        goal_sync: [
          { action: "create", title: "子目标", status: "active", parent_page_id: PARENT_PAGE },
        ],
      };

      await executeInstructions(instructions, "user-1", [REC_1]);

      // level = Math.max(1, 1-1) = Math.max(1, 0) = 1
      expect(mockWikiPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({ level: 1 }),
        mockClient,
      );
    });
  });
});
