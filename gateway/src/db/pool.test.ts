/**
 * repo 层 client 参数透传测试
 *
 * 验证 pool.ts 改造后，repo 方法正确透传可选 client 参数。
 * Mock pool.js 模块，检查 query/queryOne/execute 收到的第三个参数。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  getPool: vi.fn(),
}));

// todo.ts 依赖 embeddings
vi.mock("../../memory/embeddings.js", () => ({
  getEmbedding: vi.fn(),
  cosineSimilarity: vi.fn(),
}));

// todo.ts 依赖 tz
vi.mock("../../lib/tz.js", () => ({
  daysAgo: vi.fn().mockReturnValue("2026-04-01"),
}));

import { query, queryOne, execute } from "./pool.js";
import type { Queryable } from "./pool.js";
import {
  create as wpCreate,
  findById as wpFindById,
  update as wpUpdate,
  updateStatus as wpUpdateStatus,
  exists as wpExists,
} from "./repositories/wiki-page.js";
import {
  link as wprLink,
  transferAll as wprTransferAll,
  inheritAll as wprInheritAll,
} from "./repositories/wiki-page-record.js";
import {
  create as todoCreate,
  update as todoUpdate,
  transferWikiPageRef as todoTransferWikiPageRef,
} from "./repositories/todo.js";
import { createLink as wplCreateLink } from "./repositories/wiki-page-link.js";
import { updateCompileStatus as recUpdateCompileStatus } from "./repositories/record.js";

describe("repo 层 client 参数透传", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 场景 1.2: Queryable 类型可赋值 undefined ──

  it("should_accept_undefined_as_Queryable", () => {
    const q: Queryable = undefined;
    expect(q).toBeUndefined();
  });

  // ── 场景 2.1: wikiPageRepo.create 透传 client ──

  it("should_pass_client_to_queryOne_when_wikiPage_create_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(queryOne).mockResolvedValue({ id: "wp-1" } as any);

    await wpCreate({ user_id: "u-1", title: "测试" }, mockClient);

    expect(vi.mocked(queryOne)).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(queryOne).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── 场景 2.3: 无 client 时行为不变 ──

  it("should_not_pass_client_when_wikiPage_create_without_client", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "wp-1" } as any);

    await wpCreate({ user_id: "u-1", title: "测试" });

    const callArgs = vi.mocked(queryOne).mock.calls[0];
    expect(callArgs[2]).toBeUndefined();
  });

  // ── wikiPageRepo.findById 透传 client ──

  it("should_pass_client_to_queryOne_when_findById_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(queryOne).mockResolvedValue(null);

    await wpFindById("wp-1", mockClient);

    const callArgs = vi.mocked(queryOne).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── wikiPageRepo.update 透传 client ──

  it("should_pass_client_to_execute_when_update_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(execute).mockResolvedValue(1);

    await wpUpdate("wp-1", { content: "新内容" }, mockClient);

    const callArgs = vi.mocked(execute).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── wikiPageRepo.updateStatus 透传 client ──

  it("should_pass_client_to_execute_when_updateStatus_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(execute).mockResolvedValue(1);

    await wpUpdateStatus("wp-1", "merged", "wp-2", mockClient);

    const callArgs = vi.mocked(execute).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── 场景 3.6: wikiPageRepo.exists ──

  it("should_return_true_when_page_exists", async () => {
    vi.mocked(queryOne).mockResolvedValue({ "1": 1 } as any);

    const result = await wpExists("wp-1");
    expect(result).toBe(true);
    expect(vi.mocked(queryOne).mock.calls[0][0]).toContain("SELECT 1 FROM wiki_page");
  });

  it("should_return_false_when_page_not_exists", async () => {
    vi.mocked(queryOne).mockResolvedValue(null);

    const result = await wpExists("wp-999");
    expect(result).toBe(false);
  });

  it("should_pass_client_to_exists", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(queryOne).mockResolvedValue({ "1": 1 } as any);

    await wpExists("wp-1", mockClient);
    const callArgs = vi.mocked(queryOne).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── wikiPageRecordRepo.link 透传 client ──

  it("should_pass_client_to_execute_when_link_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(execute).mockResolvedValue(1);

    await wprLink("wp-1", "rec-1", mockClient);

    const callArgs = vi.mocked(execute).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── wikiPageRecordRepo.transferAll 透传 client ──

  it("should_pass_client_to_query_when_transferAll_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(query).mockResolvedValue([]);

    await wprTransferAll("wp-src", "wp-tgt", mockClient);

    const callArgs = vi.mocked(query).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── wikiPageRecordRepo.inheritAll ──

  it("should_inherit_records_from_source_to_new_page", async () => {
    vi.mocked(execute).mockResolvedValue(3);

    const count = await wprInheritAll("wp-src", "wp-new");
    expect(count).toBe(3);
    expect(vi.mocked(execute).mock.calls[0][0]).toContain("INSERT INTO wiki_page_record");
  });

  it("should_pass_client_to_inheritAll", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(execute).mockResolvedValue(2);

    await wprInheritAll("wp-src", "wp-new", mockClient);
    const callArgs = vi.mocked(execute).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── todoRepo.create 透传 client ──

  it("should_pass_client_to_queryOne_when_todo_create_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(queryOne).mockResolvedValue({ id: "t-1" } as any);

    await todoCreate({ text: "测试待办", user_id: "u-1" }, mockClient);

    const callArgs = vi.mocked(queryOne).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── todoRepo.update 透传 client ──

  it("should_pass_client_to_execute_when_todo_update_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(execute).mockResolvedValue(1);

    await todoUpdate("t-1", { text: "更新" }, mockClient);

    const callArgs = vi.mocked(execute).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── todoRepo.transferWikiPageRef ──

  it("should_transfer_wiki_page_ref_from_source_to_target", async () => {
    vi.mocked(execute).mockResolvedValue(2);

    const count = await todoTransferWikiPageRef("wp-old", "wp-new");
    expect(count).toBe(2);
    expect(vi.mocked(execute).mock.calls[0][0]).toContain("UPDATE todo SET wiki_page_id");
    expect(vi.mocked(execute).mock.calls[0][0]).toContain("level >= 1");
  });

  it("should_pass_client_to_transferWikiPageRef", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(execute).mockResolvedValue(1);

    await todoTransferWikiPageRef("wp-old", "wp-new", mockClient);
    const callArgs = vi.mocked(execute).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── wikiPageLinkRepo.createLink 透传 client ──

  it("should_pass_client_to_queryOne_when_createLink_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(queryOne).mockResolvedValue({ id: "lnk-1" } as any);

    await wplCreateLink({
      source_page_id: "wp-1",
      target_page_id: "wp-2",
      link_type: "related",
    }, mockClient);

    const callArgs = vi.mocked(queryOne).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });

  // ── recordRepo.updateCompileStatus 透传 client ──

  it("should_pass_client_to_execute_when_updateCompileStatus_with_client", async () => {
    const mockClient = { query: vi.fn() } as unknown as Queryable;
    vi.mocked(execute).mockResolvedValue(1);

    await recUpdateCompileStatus("rec-1", "compiled", undefined, mockClient);

    const callArgs = vi.mocked(execute).mock.calls[0];
    expect(callArgs[2]).toBe(mockClient);
  });
});
