/**
 * Phase 14.6 & 14.7 — Wiki 路由测试
 *
 * - POST /api/v1/wiki/pages 支持 page_type='goal'
 * - GET /api/v1/wiki/pages/:id 返回 todo_total/todo_done
 * - GET /api/v1/wiki/suggestions
 * - POST /api/v1/wiki/suggestions/:id/accept
 * - POST /api/v1/wiki/suggestions/:id/reject
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 依赖 ──
const mockWikiPageCreate = vi.fn();
const mockWikiPageFindById = vi.fn();
const mockWikiPageFindByUser = vi.fn();
const mockWikiPageFindByParent = vi.fn();
const mockGoalFindByUser = vi.fn();
const mockFindRecordsByPage = vi.fn();
const mockPoolQuery = vi.fn();

// page-authorization mocks
const mockGetPendingSuggestions = vi.fn();
const mockAcceptSuggestion = vi.fn();
const mockRejectSuggestion = vi.fn();

vi.mock("../db/repositories/wiki-page.js", () => ({
  create: (...args: any[]) => mockWikiPageCreate(...args),
  findById: (...args: any[]) => mockWikiPageFindById(...args),
  findByUser: (...args: any[]) => mockWikiPageFindByUser(...args),
  findByParent: (...args: any[]) => mockWikiPageFindByParent(...args),
  update: vi.fn(),
}));

vi.mock("../db/repositories/wiki-page-record.js", () => ({
  findRecordsByPage: (...args: any[]) => mockFindRecordsByPage(...args),
}));

vi.mock("../db/repositories/goal.js", () => ({
  findByUser: (...args: any[]) => mockGoalFindByUser(...args),
}));

const mockPoolConnect = vi.fn();
vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockPoolQuery(...args),
  getPool: () => ({ connect: mockPoolConnect }),
}));

vi.mock("../cognitive/wiki-compiler.js", () => ({
  compileWikiForUser: vi.fn(),
}));

vi.mock("../cognitive/full-compile-maintenance.js", () => ({
  runFullCompileMaintenance: vi.fn(),
}));

vi.mock("../tools/wiki-search.js", () => ({
  wikiUnifiedSearch: vi.fn(),
}));

vi.mock("../cognitive/page-authorization.js", () => ({
  getPendingSuggestions: (...args: any[]) => mockGetPendingSuggestions(...args),
  acceptSuggestion: (...args: any[]) => mockAcceptSuggestion(...args),
  rejectSuggestion: (...args: any[]) => mockRejectSuggestion(...args),
  canAiModifyStructure: vi.fn(),
  createSuggestion: vi.fn(),
}));

vi.mock("../lib/http-helpers.js", async () => {
  const actual = await vi.importActual<any>("../lib/http-helpers.js");
  return {
    ...actual,
    getUserId: vi.fn().mockReturnValue("user-123"),
  };
});

import { registerWikiRoutes } from "./wiki.js";
import { Router } from "../router.js";

const PAGE_ID = "00000000-0000-4000-a000-000000000001";
const SUGGESTION_ID = "00000000-0000-4000-a000-000000000030";
const USER_ID = "user-123";

/** 创建模拟的 IncomingMessage */
function mockReq(method: string, url: string, body?: any) {
  const req: any = {
    method,
    url,
    headers: { host: "localhost", authorization: "Bearer test" },
    on: vi.fn((event: string, cb: Function) => {
      if (event === "data" && body) cb(JSON.stringify(body));
      if (event === "end") cb();
      return req;
    }),
  };
  return req;
}

/** 创建模拟的 ServerResponse，捕获输出 */
function mockRes() {
  let statusCode = 200;
  let body = "";
  const res: any = {
    writeHead: vi.fn((code: number) => { statusCode = code; }),
    end: vi.fn((data: string) => { body = data; }),
    getStatus: () => statusCode,
    getBody: () => JSON.parse(body || "{}"),
  };
  return res;
}

describe("wiki routes Phase 14.6 & 14.7", () => {
  let router: Router;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new Router();
    registerWikiRoutes(router);
  });

  // ── Phase 14.6: POST /api/v1/wiki/pages with page_type='goal' ──

  describe("POST /api/v1/wiki/pages — goal page", () => {
    it("should_create_goal_page_and_goal_todo_when_page_type_is_goal", async () => {
      // 事务模式：connect → BEGIN → INSERT page → INSERT todo → COMMIT
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: PAGE_ID, title: "通过四级考试", level: 3 }] }) // INSERT page
          .mockResolvedValueOnce(undefined) // INSERT todo
          .mockResolvedValueOnce(undefined), // COMMIT
        release: vi.fn(),
      };
      mockPoolConnect.mockResolvedValue(mockClient);

      const req = mockReq("POST", "/api/v1/wiki/pages", {
        title: "通过四级考试",
        page_type: "goal",
      });
      const res = mockRes();
      await router.handle(req, res);

      // 验证事务中创建了 page 和 todo
      const calls = mockClient.query.mock.calls;
      expect(calls[0][0]).toBe("BEGIN");
      expect(calls[1][0]).toContain("INSERT INTO wiki_page");
      expect(calls[2][0]).toContain("INSERT INTO todo");
      expect(calls[3][0]).toBe("COMMIT");

      const body = res.getBody();
      expect(body.id).toBe(PAGE_ID);
    });

    it("should_create_normal_topic_page_when_page_type_not_specified", async () => {
      mockWikiPageCreate.mockResolvedValue({
        id: PAGE_ID,
        title: "学习笔记",
        level: 3,
        page_type: "topic",
      });

      const req = mockReq("POST", "/api/v1/wiki/pages", {
        title: "学习笔记",
      });
      const res = mockRes();
      await router.handle(req, res);

      expect(mockWikiPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({ page_type: undefined }),
      );
      // 不应创建 goal todo
      expect(mockPoolQuery).not.toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO todo"),
        expect.anything(),
      );
    });
  });

  // ── Phase 14.6: GET /api/v1/wiki/pages/:id — goal page 进度 ──

  describe("GET /api/v1/wiki/pages/:id — goal progress", () => {
    it("should_return_todo_total_and_todo_done_when_page_type_is_goal", async () => {
      mockWikiPageFindById.mockResolvedValue({
        id: PAGE_ID,
        user_id: USER_ID,
        title: "通过四级考试",
        content: "## 目标",
        summary: "四级考试",
        level: 3,
        page_type: "goal",
      });
      mockWikiPageFindByParent.mockResolvedValue([]);
      mockGoalFindByUser.mockResolvedValue([
        { id: "g1", title: "通过四级", status: "active", wiki_page_id: PAGE_ID },
      ]);
      mockFindRecordsByPage.mockResolvedValue([]);

      // mock todo 统计查询
      mockPoolQuery.mockResolvedValue([{ total: "5", done: "2" }]);

      const req = mockReq("GET", `/api/v1/wiki/pages/${PAGE_ID}`);
      const res = mockRes();
      await router.handle(req, res);

      const body = res.getBody();
      expect(body.todo_total).toBe(5);
      expect(body.todo_done).toBe(2);
    });

    it("should_not_return_todo_stats_when_page_type_is_topic", async () => {
      mockWikiPageFindById.mockResolvedValue({
        id: PAGE_ID,
        user_id: USER_ID,
        title: "学习笔记",
        content: "## 笔记",
        summary: "笔记",
        level: 3,
        page_type: "topic",
      });
      mockWikiPageFindByParent.mockResolvedValue([]);
      mockGoalFindByUser.mockResolvedValue([]);
      mockFindRecordsByPage.mockResolvedValue([]);

      const req = mockReq("GET", `/api/v1/wiki/pages/${PAGE_ID}`);
      const res = mockRes();
      await router.handle(req, res);

      const body = res.getBody();
      expect(body.todo_total).toBeUndefined();
      expect(body.todo_done).toBeUndefined();
    });
  });

  // ── Phase 14.7: Suggestion API ──

  describe("GET /api/v1/wiki/suggestions", () => {
    it("should_return_pending_suggestions_for_user", async () => {
      mockGetPendingSuggestions.mockResolvedValue([
        {
          id: SUGGESTION_ID,
          user_id: USER_ID,
          suggestion_type: "split",
          payload: { source_id: PAGE_ID },
          status: "pending",
          created_at: "2026-04-11T10:00:00Z",
        },
      ]);

      const req = mockReq("GET", "/api/v1/wiki/suggestions");
      const res = mockRes();
      await router.handle(req, res);

      const body = res.getBody();
      expect(body).toHaveProperty("suggestions");
      expect(Array.isArray(body.suggestions)).toBe(true);
      expect(body.suggestions[0].id).toBe(SUGGESTION_ID);
      expect(mockGetPendingSuggestions).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe("POST /api/v1/wiki/suggestions/:id/accept", () => {
    it("should_accept_suggestion_when_valid_id", async () => {
      mockAcceptSuggestion.mockResolvedValue(undefined);

      const req = mockReq("POST", `/api/v1/wiki/suggestions/${SUGGESTION_ID}/accept`);
      const res = mockRes();
      await router.handle(req, res);

      expect(mockAcceptSuggestion).toHaveBeenCalledWith(SUGGESTION_ID, USER_ID);
      const body = res.getBody();
      expect(body.ok).toBe(true);
    });
  });

  describe("POST /api/v1/wiki/suggestions/:id/reject", () => {
    it("should_reject_suggestion_when_valid_id", async () => {
      mockRejectSuggestion.mockResolvedValue(undefined);

      const req = mockReq("POST", `/api/v1/wiki/suggestions/${SUGGESTION_ID}/reject`);
      const res = mockRes();
      await router.handle(req, res);

      expect(mockRejectSuggestion).toHaveBeenCalledWith(SUGGESTION_ID, USER_ID);
      const body = res.getBody();
      expect(body.ok).toBe(true);
    });
  });
});
