/**
 * process.ts — page_title 即时归类 单元测试
 * spec: fix-process-domain-to-page
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 外部依赖
vi.mock("../db/repositories/wiki-page.js", () => ({
  create: vi.fn(),
  incrementTokenCount: vi.fn(),
}));
vi.mock("../db/repositories/wiki-page-record.js", () => ({
  link: vi.fn(),
}));
vi.mock("../cognitive/compile-trigger.js", () => ({
  checkAndTriggerCompile: vi.fn().mockResolvedValue(undefined),
}));

import { classifyByPageTitle, type ClassifyByPageTitleParams } from "./process.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../db/repositories/wiki-page-record.js";

const mockCreate = wikiPageRepo.create as ReturnType<typeof vi.fn>;
const mockLink = wikiPageRecordRepo.link as ReturnType<typeof vi.fn>;
const mockIncrementTokenCount = wikiPageRepo.incrementTokenCount as ReturnType<typeof vi.fn>;

describe("classifyByPageTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIncrementTokenCount.mockResolvedValue(100);
  });

  // 场景 2.1: AI 返回已有 page 标题 → 立即关联
  it("should_link_to_existing_page_when_page_title_matches", async () => {
    const params: ClassifyByPageTitleParams = {
      pageTitle: "采购管理",
      recordId: "rec-1",
      userId: "user-1",
      textLength: 50,
      existingPages: [
        { id: "page-1", title: "采购管理" },
        { id: "page-2", title: "Rust 学习" },
      ],
    };

    await classifyByPageTitle(params);

    // 不应创建新 page
    expect(mockCreate).not.toHaveBeenCalled();
    // 应关联到已有 page
    expect(mockLink).toHaveBeenCalledWith("page-1", "rec-1");
    // 应更新 token_count
    expect(mockIncrementTokenCount).toHaveBeenCalledWith("page-1", Math.ceil(50 * 2));
  });

  // 场景 2.2: AI 返回新标题 → 创建 page 并关联
  it("should_create_new_page_when_page_title_not_matched", async () => {
    mockCreate.mockResolvedValue({ id: "new-page-id", title: "供应链优化" });

    const params: ClassifyByPageTitleParams = {
      pageTitle: "供应链优化",
      recordId: "rec-2",
      userId: "user-1",
      textLength: 80,
      existingPages: [{ id: "page-1", title: "采购管理" }],
    };

    await classifyByPageTitle(params);

    expect(mockCreate).toHaveBeenCalledWith({
      user_id: "user-1",
      title: "供应链优化",
      level: 3,
      created_by: "ai",
      page_type: "topic",
    });
    expect(mockLink).toHaveBeenCalledWith("new-page-id", "rec-2");
    expect(mockIncrementTokenCount).toHaveBeenCalledWith("new-page-id", Math.ceil(80 * 2));
  });

  // 场景 2.3: page_title 为 null → 跳过归类
  it("should_skip_when_page_title_is_null", async () => {
    const params: ClassifyByPageTitleParams = {
      pageTitle: null,
      recordId: "rec-3",
      userId: "user-1",
      textLength: 50,
      existingPages: [],
    };

    await classifyByPageTitle(params);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLink).not.toHaveBeenCalled();
  });

  // 边界条件: page_title 为空字符串 → 视为 null，跳过归类
  it("should_skip_when_page_title_is_empty_string", async () => {
    const params: ClassifyByPageTitleParams = {
      pageTitle: "",
      recordId: "rec-4",
      userId: "user-1",
      textLength: 50,
      existingPages: [],
    };

    await classifyByPageTitle(params);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLink).not.toHaveBeenCalled();
  });

  // 边界条件: page_title 为空格字符串 → 视为 null
  it("should_skip_when_page_title_is_whitespace", async () => {
    await classifyByPageTitle({
      pageTitle: "   ",
      recordId: "rec-5",
      userId: "user-1",
      textLength: 50,
      existingPages: [],
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLink).not.toHaveBeenCalled();
  });

  // 边界条件: userId 为空 → 跳过归类
  it("should_skip_when_userId_is_undefined", async () => {
    await classifyByPageTitle({
      pageTitle: "采购管理",
      recordId: "rec-6",
      userId: undefined,
      textLength: 50,
      existingPages: [{ id: "page-1", title: "采购管理" }],
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLink).not.toHaveBeenCalled();
  });

  // 边界条件: recordId 为空 → 跳过归类
  it("should_skip_when_recordId_is_undefined", async () => {
    await classifyByPageTitle({
      pageTitle: "采购管理",
      recordId: undefined,
      userId: "user-1",
      textLength: 50,
      existingPages: [{ id: "page-1", title: "采购管理" }],
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLink).not.toHaveBeenCalled();
  });

  // 边界条件: create 失败时不应崩溃
  it("should_not_throw_when_create_fails", async () => {
    mockCreate.mockRejectedValue(new Error("DB error"));

    await expect(
      classifyByPageTitle({
        pageTitle: "新主题",
        recordId: "rec-7",
        userId: "user-1",
        textLength: 50,
        existingPages: [],
      }),
    ).resolves.toBeUndefined();
  });

  // 场景 2.4: process.ts 端仅做精确字符串匹配
  it("should_only_do_exact_match_not_fuzzy", async () => {
    mockCreate.mockResolvedValue({ id: "new-page-id", title: "工作进度" });

    await classifyByPageTitle({
      pageTitle: "工作进度",
      recordId: "rec-8",
      userId: "user-1",
      textLength: 50,
      existingPages: [{ id: "page-1", title: "工作事项" }],
    });

    // "工作进度" !== "工作事项"，所以应创建新 page
    expect(mockCreate).toHaveBeenCalled();
    expect(mockLink).toHaveBeenCalledWith("new-page-id", "rec-8");
  });
});
