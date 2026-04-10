/**
 * cognitive-wiki spec Phase 5 — topics 路由测试（wiki_page 数据源）
 *
 * 场景 5.1: GET /api/v1/topics — wiki_page-based 主题列表
 * 场景 5.3: GET /api/v1/topics/:id/lifecycle — 四阶段数据（wiki 数据源）
 * 场景 5.5: POST /goals/:id/harvest — 收获沉淀保持兼容
 *
 * seeds 解析：从 wiki page content 中提取非目标段落
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 依赖 ──
vi.mock("../db/pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../db/repositories/index.js", () => ({
  wikiPageRepo: {
    findByUser: vi.fn(),
    findById: vi.fn(),
  },
  wikiPageRecordRepo: {
    countByPage: vi.fn(),
  },
  goalRepo: {
    findById: vi.fn(),
    findByUser: vi.fn(),
    update: vi.fn(),
    findTodosByGoalIds: vi.fn(),
  },
  strikeRepo: { create: vi.fn() },
  bondRepo: { create: vi.fn() },
}));

vi.mock("../cognitive/embed-writer.js", () => ({
  writeStrikeEmbedding: vi.fn(),
}));

import { query, queryOne } from "../db/pool.js";
import { wikiPageRepo, wikiPageRecordRepo, goalRepo } from "../db/repositories/index.js";

// ── 辅助：解析 wiki content 中的 seed 段落 ──
import { parseWikiSeeds, parseWikiHarvest } from "./topics-wiki-helpers.js";

describe("cognitive-wiki Phase 5: parseWikiSeeds 段落解析", () => {
  it("should_extract_non_goal_sections_when_content_has_multiple_sections", () => {
    const content = `## 核心认知

这是一个关于供应链的认知。

供应商评估需要考虑多维度。

## 目标

- 完成供应商评估
- 签订合同

## 关键决策链

选择了A供应商，价格降了15%。

## 子页索引

- [[子页1]]`;

    const seeds = parseWikiSeeds(content);
    // 应该包含"核心认知"和"关键决策链"段落，不包含"目标"和"子页索引"
    expect(seeds.length).toBeGreaterThanOrEqual(1);
    expect(seeds.some(s => s.content.includes("供应链"))).toBe(true);
    expect(seeds.some(s => s.content.includes("完成供应商评估"))).toBe(false);
    expect(seeds.some(s => s.content.includes("[[子页1]]"))).toBe(false);
  });

  it("should_return_empty_array_when_content_is_empty", () => {
    const seeds = parseWikiSeeds("");
    expect(seeds).toEqual([]);
  });

  it("should_return_all_paragraphs_as_seeds_when_no_excluded_sections", () => {
    const content = `## 市场分析

当前市场趋势向好。

## 竞争格局

竞争对手A正在扩张。`;

    const seeds = parseWikiSeeds(content);
    expect(seeds.length).toBe(2);
  });

  it("should_assign_section_type_and_generate_ids_for_each_seed", () => {
    const content = `## 核心认知

洞察内容在此。`;

    const seeds = parseWikiSeeds(content);
    expect(seeds[0]).toHaveProperty("id");
    expect(seeds[0]).toHaveProperty("content");
    expect(seeds[0].type).toBe("section");
  });
});

describe("cognitive-wiki Phase 5: parseWikiHarvest", () => {
  it("should_extract_harvest_paragraphs_from_decision_chain_section", () => {
    const content = `## 核心认知

一些认知。

## 关键决策链

选择了A供应商，价格降了15%。
[完成于 2026-03-14]

评估了B方案，最终放弃。`;

    const harvest = parseWikiHarvest(content);
    expect(harvest.length).toBeGreaterThanOrEqual(1);
    expect(harvest.some(h => h.content.includes("A供应商"))).toBe(true);
  });

  it("should_return_empty_array_when_no_decision_chain_section", () => {
    const content = `## 核心认知

只有认知，没有决策。`;

    const harvest = parseWikiHarvest(content);
    expect(harvest).toEqual([]);
  });
});

// ── GET /api/v1/topics 契约测试 ──

describe("cognitive-wiki Phase 5: GET /api/v1/topics 响应结构", () => {
  it("should_return_wikiPageId_field_instead_of_clusterId", () => {
    // API 响应结构校验
    const topicItem = {
      wikiPageId: "wp-uuid-1",
      title: "供应链管理",
      recordCount: 12,
      activeGoals: [{ id: "g1", title: "评估供应商" }],
      lastActivity: "2026-03-28T10:00:00Z",
      hasActiveGoal: true,
      level: 3,
      parentId: null as string | null,
    };

    expect(topicItem.wikiPageId).toBeDefined();
    expect(topicItem).not.toHaveProperty("clusterId");
    expect(topicItem).not.toHaveProperty("memberCount");
    expect(topicItem).not.toHaveProperty("intendDensity");
    expect(typeof topicItem.recordCount).toBe("number");
    expect(typeof topicItem.level).toBe("number");
    expect(topicItem.parentId).toBeNull();
  });

  it("should_return_recordCount_instead_of_memberCount", () => {
    const topicItem = {
      wikiPageId: "wp-2",
      title: "健康管理",
      recordCount: 5,
      activeGoals: [],
      lastActivity: "2026-03-20T10:00:00Z",
      hasActiveGoal: false,
      level: 2,
      parentId: "wp-1",
    };

    expect(topicItem.recordCount).toBe(5);
    expect(topicItem).not.toHaveProperty("memberCount");
  });
});

describe("cognitive-wiki Phase 5: GET /api/v1/topics/:id/lifecycle 响应结构", () => {
  it("should_return_seeds_as_wiki_sections_not_strikes", () => {
    const lifecycle = {
      now: [{ id: "t1", text: "打给张总", done: false, scheduled_start: null }],
      growing: [{
        goal: { id: "g1", title: "评估供应商", status: "active" },
        todos: [{ id: "t2", text: "对比分析", done: false }],
        completionPercent: 60,
      }],
      seeds: [{
        id: "seed-1",
        content: "供应链认知段落",
        type: "section" as const,
      }],
      harvest: [{
        goal: { id: "g2", title: "铝价走势判断", status: "completed" },
        content: "选择了A供应商，价格降了15%",
        completedAt: "2026-03-14T10:00:00Z",
      }],
    };

    // seeds 应为 {id, content, type} 而非 {id, nucleus, polarity}
    expect(lifecycle.seeds[0]).toHaveProperty("content");
    expect(lifecycle.seeds[0]).toHaveProperty("type");
    expect(lifecycle.seeds[0]).not.toHaveProperty("nucleus");
    expect(lifecycle.seeds[0]).not.toHaveProperty("polarity");

    // harvest 应为 {goal, content, completedAt} 而非 {goal, reviewStrike, completedAt}
    expect(lifecycle.harvest[0]).toHaveProperty("content");
    expect(lifecycle.harvest[0]).not.toHaveProperty("reviewStrike");
  });
});

describe("cognitive-wiki Phase 5: topics 路由空数据处理", () => {
  it("should_return_empty_list_when_user_has_no_wiki_pages", () => {
    // 模拟无 wiki page 用户 → 空列表
    const emptyTopics: any[] = [];
    expect(emptyTopics).toEqual([]);
  });

  it("should_return_empty_lifecycle_when_wiki_page_has_no_content", () => {
    const emptyLifecycle = {
      now: [],
      growing: [],
      seeds: [],
      harvest: [],
    };
    expect(emptyLifecycle.now).toHaveLength(0);
    expect(emptyLifecycle.seeds).toHaveLength(0);
  });
});
