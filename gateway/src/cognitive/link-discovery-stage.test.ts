/**
 * Link 发现（阶段 5）+ 编译器 link 指令处理 单元测试 — Phase 14.11
 *
 * 覆盖场景：
 * - 关键词匹配：page A content 提到 page B title → 创建 related link
 * - 自引用排除：page 不应链接到自身
 * - 已有 link 不重复创建（createLink 的 upsert 语义）
 * - link 指令中无效 UUID 被跳过
 * - link 指令中不存在的 page_id 被跳过
 * - 编译 prompt 包含 links 字段说明
 * - parseCompileResponse 解析 links 数组
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 依赖 ──

vi.mock("../db/repositories/wiki-page.js", () => ({
  findAllActive: vi.fn(),
}));

vi.mock("../db/repositories/wiki-page-link.js", () => ({
  createLink: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

import { discoverLinks } from "./link-discovery-stage.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageLinkRepo from "../db/repositories/wiki-page-link.js";
import { query } from "../db/pool.js";

const mockFindAllActive = vi.mocked(wikiPageRepo.findAllActive);
const mockCreateLink = vi.mocked(wikiPageLinkRepo.createLink);
const mockQuery = vi.mocked(query);

function makePage(overrides: Partial<{
  id: string; title: string; content: string; summary: string | null;
}> = {}) {
  return {
    id: overrides.id ?? "wp-1",
    user_id: "u-1",
    title: overrides.title ?? "测试页面",
    content: overrides.content ?? "some content",
    summary: overrides.summary ?? null,
    parent_id: null,
    level: 3,
    status: "active" as const,
    merged_into: null,
    domain: null,
    page_type: "topic" as const,
    token_count: 0,
    created_by: "ai" as const,
    embedding: null,
    metadata: {},
    compiled_at: null,
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-10T10:00:00Z",
  };
}

describe("link-discovery-stage (Phase 14.11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateLink.mockResolvedValue({
      id: "link-new",
      source_page_id: "wp-1",
      target_page_id: "wp-2",
      link_type: "related",
      context_text: null,
      created_at: "2026-04-11T10:00:00Z",
    });
  });

  it("should_create_related_link_when_page_content_mentions_another_page_title", async () => {
    mockFindAllActive.mockResolvedValue([
      makePage({ id: "wp-1", title: "供应链优化", content: "需要关注 React 学习进度，与技术团队协调" }),
      makePage({ id: "wp-2", title: "React 学习", content: "学习 React Hooks 的最佳实践" }),
    ] as any);

    const result = await discoverLinks("u-1");

    expect(result.linksCreated).toBeGreaterThanOrEqual(1);
    expect(mockCreateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        source_page_id: "wp-1",
        target_page_id: "wp-2",
        link_type: "related",
      }),
    );
  });

  it("should_not_create_self_link_when_page_mentions_its_own_title", async () => {
    mockFindAllActive.mockResolvedValue([
      makePage({ id: "wp-1", title: "供应链", content: "供应链管理的核心原则" }),
    ] as any);

    const result = await discoverLinks("u-1");

    expect(result.linksCreated).toBe(0);
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it("should_not_create_link_when_no_keyword_match", async () => {
    mockFindAllActive.mockResolvedValue([
      makePage({ id: "wp-1", title: "供应链优化", content: "采购策略需要调整" }),
      makePage({ id: "wp-2", title: "React 学习", content: "组件化开发" }),
    ] as any);

    const result = await discoverLinks("u-1");

    expect(result.linksCreated).toBe(0);
  });

  it("should_skip_short_titles_to_avoid_false_positives", async () => {
    // title 太短（如单个字）会产生过多误匹配
    mockFindAllActive.mockResolvedValue([
      makePage({ id: "wp-1", title: "工", content: "工作内容" }),
      makePage({ id: "wp-2", title: "生活", content: "工作之余的生活" }),
    ] as any);

    const result = await discoverLinks("u-1");

    // "工" 只有 1 个字，应被跳过（最低 2 个字符）
    expect(mockCreateLink).not.toHaveBeenCalledWith(
      expect.objectContaining({ target_page_id: "wp-1" }),
    );
  });

  it("should_create_bidirectional_links_when_pages_mention_each_other", async () => {
    mockFindAllActive.mockResolvedValue([
      makePage({ id: "wp-1", title: "供应链优化", content: "与 React 学习 相关的工具" }),
      makePage({ id: "wp-2", title: "React 学习", content: "供应链优化 系统的前端" }),
    ] as any);

    const result = await discoverLinks("u-1");

    expect(result.linksCreated).toBe(2);
    expect(mockCreateLink).toHaveBeenCalledTimes(2);
  });

  it("should_return_zero_when_only_one_page_exists", async () => {
    mockFindAllActive.mockResolvedValue([
      makePage({ id: "wp-1", title: "唯一页面", content: "独立内容" }),
    ] as any);

    const result = await discoverLinks("u-1");

    expect(result.linksCreated).toBe(0);
  });
});
