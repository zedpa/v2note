/**
 * Phase 15.2 — sidebar API 增强测试
 *
 * - GET /api/v1/wiki/sidebar 返回 pageType 字段
 * - GET /api/v1/wiki/sidebar 返回 pendingSuggestionCount
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 依赖 ──
const mockWikiPageFindByUser = vi.fn();
const mockPoolQuery = vi.fn();

vi.mock("../db/repositories/wiki-page.js", () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByUser: (...args: any[]) => mockWikiPageFindByUser(...args),
  findByParent: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../db/repositories/wiki-page-record.js", () => ({
  findRecordsByPage: vi.fn(),
}));

vi.mock("../db/repositories/goal.js", () => ({
  findByUser: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockPoolQuery(...args),
  getPool: () => ({ connect: vi.fn() }),
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
  getPendingSuggestions: vi.fn(),
  acceptSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
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

const USER_ID = "user-123";

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

describe("wiki sidebar — Phase 15.2", () => {
  let router: Router;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new Router();
    registerWikiRoutes(router);
  });

  it("should_include_pageType_in_sidebar_page_response", async () => {
    // findByUser 返回含 page_type 的 page
    mockWikiPageFindByUser.mockResolvedValue([
      {
        id: "p1",
        title: "通过四级考试",
        level: 3,
        parent_id: null,
        created_by: "ai",
        page_type: "goal",
        updated_at: "2026-04-12T00:00:00Z",
      },
      {
        id: "p2",
        title: "技术笔记",
        level: 3,
        parent_id: null,
        created_by: "ai",
        page_type: "topic",
        updated_at: "2026-04-12T00:00:00Z",
      },
    ]);

    // pool.query 依次返回: recordCounts, activeGoals, inboxCount, pendingSuggestionCount
    mockPoolQuery
      .mockResolvedValueOnce([]) // recordCounts
      .mockResolvedValueOnce([]) // activeGoals
      .mockResolvedValueOnce([{ count: "0" }]) // inboxCount
      .mockResolvedValueOnce([{ count: "0" }]); // pendingSuggestionCount

    const req = mockReq("GET", "/api/v1/wiki/sidebar");
    const res = mockRes();
    await router.handle(req, res);

    const body = res.getBody();
    expect(body.pages).toBeDefined();
    expect(body.pages.length).toBe(2);

    const goalPage = body.pages.find((p: any) => p.id === "p1");
    const topicPage = body.pages.find((p: any) => p.id === "p2");
    expect(goalPage.pageType).toBe("goal");
    expect(topicPage.pageType).toBe("topic");
  });

  it("should_include_pendingSuggestionCount_in_sidebar_response", async () => {
    mockWikiPageFindByUser.mockResolvedValue([]);

    mockPoolQuery
      .mockResolvedValueOnce([]) // recordCounts
      .mockResolvedValueOnce([]) // activeGoals
      .mockResolvedValueOnce([{ count: "0" }]) // inboxCount
      .mockResolvedValueOnce([{ count: "5" }]); // pendingSuggestionCount

    const req = mockReq("GET", "/api/v1/wiki/sidebar");
    const res = mockRes();
    await router.handle(req, res);

    const body = res.getBody();
    expect(body.pendingSuggestionCount).toBe(5);
  });

  it("should_return_zero_pendingSuggestionCount_when_no_pending_suggestions", async () => {
    mockWikiPageFindByUser.mockResolvedValue([]);

    mockPoolQuery
      .mockResolvedValueOnce([]) // recordCounts
      .mockResolvedValueOnce([]) // activeGoals
      .mockResolvedValueOnce([{ count: "0" }]) // inboxCount
      .mockResolvedValueOnce([{ count: "0" }]); // pendingSuggestionCount

    const req = mockReq("GET", "/api/v1/wiki/sidebar");
    const res = mockRes();
    await router.handle(req, res);

    const body = res.getBody();
    expect(body.pendingSuggestionCount).toBe(0);
  });
});
