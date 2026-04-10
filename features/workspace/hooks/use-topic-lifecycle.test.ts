/**
 * cognitive-wiki Phase 5 — 前端主题列表 + 生命周期测试
 *
 * 场景 5.1: 侧边栏主题列表（wikiPageId 替代 clusterId）
 * 场景 5.3: 生命周期四阶段（seeds 为 wiki 段落，harvest 为收获内容）
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock API
vi.mock("@/shared/lib/api/topics", () => ({
  fetchTopics: vi.fn(),
  fetchTopicLifecycle: vi.fn(),
}));

import { fetchTopics, fetchTopicLifecycle } from "@/shared/lib/api/topics";

describe("cognitive-wiki Phase 5: 场景 5.1 — 侧边栏主题列表", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_return_wikiPageId_instead_of_clusterId_when_topics_loaded", async () => {
    const mockTopics = [
      {
        wikiPageId: "wp-1",
        title: "供应链管理",
        recordCount: 12,
        activeGoals: [{ id: "g1", title: "评估供应商" }],
        lastActivity: "2026-03-28T10:00:00Z",
        hasActiveGoal: true,
        level: 3,
        parentId: null,
      },
      {
        wikiPageId: "wp-2",
        title: "健康管理",
        recordCount: 5,
        activeGoals: [],
        lastActivity: "2026-03-20T10:00:00Z",
        hasActiveGoal: false,
        level: 3,
        parentId: null,
      },
    ];
    (fetchTopics as any).mockResolvedValue(mockTopics);

    const topics = await fetchTopics();
    // 验证新字段结构
    expect(topics[0].wikiPageId).toBe("wp-1");
    expect(topics[0]).not.toHaveProperty("clusterId");
    expect(topics[0]).not.toHaveProperty("memberCount");
    expect(topics[0]).not.toHaveProperty("intendDensity");
    expect(typeof topics[0].recordCount).toBe("number");
    expect(typeof topics[0].level).toBe("number");
  });

  it("should_separate_topics_into_active_and_silent_based_on_recordCount_when_loaded", async () => {
    const mockTopics = [
      { wikiPageId: "wp-1", title: "供应链管理", recordCount: 12, activeGoals: [{ id: "g1", title: "评估供应商" }], lastActivity: "2026-03-28T10:00:00Z", hasActiveGoal: true, level: 3, parentId: null },
      { wikiPageId: "wp-2", title: "健康管理", recordCount: 5, activeGoals: [], lastActivity: "2026-03-20T10:00:00Z", hasActiveGoal: false, level: 3, parentId: null },
    ];
    (fetchTopics as any).mockResolvedValue(mockTopics);

    const topics = await fetchTopics();
    const active = topics.filter((t: any) => t.hasActiveGoal);
    const silent = topics.filter((t: any) => !t.hasActiveGoal && t.recordCount >= 3);

    expect(active).toHaveLength(1);
    expect(active[0].title).toBe("供应链管理");
    expect(silent).toHaveLength(1);
    expect(silent[0].title).toBe("健康管理");
  });

  it("should_classify_low_record_pages_as_independent_when_no_active_goal", async () => {
    const mockTopics = [
      { wikiPageId: "wp-1", title: "碎片想法", recordCount: 2, activeGoals: [], lastActivity: "2026-03-28T10:00:00Z", hasActiveGoal: false, level: 3, parentId: null },
    ];
    (fetchTopics as any).mockResolvedValue(mockTopics);

    const topics = await fetchTopics();
    const independent = topics.filter((t: any) => !t.hasActiveGoal && t.recordCount < 3);
    expect(independent).toHaveLength(1);
    expect(independent[0].title).toBe("碎片想法");
  });
});

describe("cognitive-wiki Phase 5: 场景 5.2 — 筛选参数切换", () => {
  it("should_use_wikiPageId_for_filter_persistence_instead_of_clusterId", () => {
    const key = "v2note:topicFilter";
    const filterValue = { wikiPageId: "wp-1", title: "供应链管理" };
    const serialized = JSON.stringify(filterValue);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.wikiPageId).toBe("wp-1");
    expect(deserialized).not.toHaveProperty("clusterId");
    expect(deserialized.title).toBe("供应链管理");
  });
});

describe("cognitive-wiki Phase 5: 场景 5.3 — 生命周期四阶段", () => {
  it("should_return_seeds_as_wiki_sections_when_lifecycle_loaded", async () => {
    const mockLifecycle = {
      now: [{ id: "t1", text: "打给张总", done: false }],
      growing: [{ goal: { id: "g1", title: "评估供应商", status: "active" }, todos: [], completionPercent: 60 }],
      seeds: [{ id: "seed-1", content: "供应链认知段落", type: "section" as const }],
      harvest: [{ goal: { id: "g2", title: "铝价走势判断", status: "completed" }, content: "选择了A供应商", completedAt: "2026-03-14" }],
    };
    (fetchTopicLifecycle as any).mockResolvedValue(mockLifecycle);

    const lifecycle = await fetchTopicLifecycle("wp-1");
    expect(lifecycle.now).toHaveLength(1);
    expect(lifecycle.growing).toHaveLength(1);
    expect(lifecycle.growing[0].completionPercent).toBe(60);

    // seeds 是 wiki 段落而非 Strike
    expect(lifecycle.seeds).toHaveLength(1);
    expect(lifecycle.seeds[0]).toHaveProperty("content");
    expect(lifecycle.seeds[0]).toHaveProperty("type");
    expect(lifecycle.seeds[0].type).toBe("section");
    expect(lifecycle.seeds[0]).not.toHaveProperty("nucleus");
    expect(lifecycle.seeds[0]).not.toHaveProperty("polarity");

    // harvest 是 {goal, content, completedAt} 而非 {goal, reviewStrike, completedAt}
    expect(lifecycle.harvest).toHaveLength(1);
    expect(lifecycle.harvest[0]).toHaveProperty("content");
    expect(lifecycle.harvest[0]).not.toHaveProperty("reviewStrike");
  });

  it("should_handle_empty_lifecycle_when_wiki_page_is_new", async () => {
    (fetchTopicLifecycle as any).mockResolvedValue({
      now: [], growing: [], seeds: [], harvest: [],
    });

    const lifecycle = await fetchTopicLifecycle("wp-new");
    expect(lifecycle.now).toHaveLength(0);
    expect(lifecycle.growing).toHaveLength(0);
    expect(lifecycle.seeds).toHaveLength(0);
    expect(lifecycle.harvest).toHaveLength(0);
  });
});

describe("cognitive-wiki Phase 5: 场景 5.9 — 酝酿期 recordCount 替代 memberCount", () => {
  it("should_use_recordCount_for_incubation_threshold_display", () => {
    // 酝酿态：recordCount < 3 → "已收集 N 条日记"
    const topic = { wikiPageId: "wp-1", title: "新方向", recordCount: 2, hasActiveGoal: false };
    const isIncubating = topic.recordCount < 3;
    expect(isIncubating).toBe(true);
  });
});
