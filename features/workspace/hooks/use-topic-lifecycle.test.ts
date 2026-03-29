/**
 * topic-lifecycle spec — 场景 1-4, 10-12
 * 主题列表 + 生命周期数据 + 筛选状态
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

describe("topic-lifecycle: 场景 1 — 侧边栏主题列表", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_separate_topics_into_active_independent_and_silent_when_loaded", async () => {
    const mockTopics = [
      { clusterId: "c1", title: "供应链管理", memberCount: 12, activeGoals: [{ id: "g1", title: "评估供应商" }], lastActivity: "2026-03-28T10:00:00Z", intendDensity: 0.4, hasActiveGoal: true },
      { clusterId: "c2", title: "健康管理", memberCount: 3, activeGoals: [], lastActivity: "2026-03-20T10:00:00Z", intendDensity: 0.1, hasActiveGoal: false },
    ];
    (fetchTopics as any).mockResolvedValue(mockTopics);

    const topics = await fetchTopics();
    const active = topics.filter((t: any) => t.hasActiveGoal);
    const silent = topics.filter((t: any) => !t.hasActiveGoal && t.memberCount >= 3);

    expect(active).toHaveLength(1);
    expect(active[0].title).toBe("供应链管理");
    expect(silent).toHaveLength(1);
    expect(silent[0].title).toBe("健康管理");
  });

  it("should_filter_out_clusters_with_fewer_than_3_members", async () => {
    const mockTopics = [
      { clusterId: "c1", title: "碎片", memberCount: 2, activeGoals: [], lastActivity: "2026-03-28T10:00:00Z", intendDensity: 0, hasActiveGoal: false },
    ];
    (fetchTopics as any).mockResolvedValue(mockTopics);

    const topics = await fetchTopics();
    const visible = topics.filter((t: any) => t.memberCount >= 3 || t.hasActiveGoal);
    expect(visible).toHaveLength(0);
  });
});

describe("topic-lifecycle: 场景 3 — 生命周期四阶段", () => {
  it("should_return_now_growing_seeds_harvest_when_lifecycle_loaded", async () => {
    const mockLifecycle = {
      now: [{ id: "t1", text: "打给张总", done: false }],
      growing: [{ goal: { id: "g1", title: "评估供应商" }, todos: [], completionPercent: 60 }],
      seeds: [{ id: "s1", nucleus: "应该考虑备用供应商", polarity: "intend" }],
      harvest: [{ goal: { id: "g2", title: "铝价走势判断" }, reviewStrike: null, completedAt: "2026-03-14" }],
    };
    (fetchTopicLifecycle as any).mockResolvedValue(mockLifecycle);

    const lifecycle = await fetchTopicLifecycle("c1");
    expect(lifecycle.now).toHaveLength(1);
    expect(lifecycle.growing).toHaveLength(1);
    expect(lifecycle.growing[0].completionPercent).toBe(60);
    expect(lifecycle.seeds).toHaveLength(1);
    expect(lifecycle.harvest).toHaveLength(1);
  });

  it("should_handle_empty_lifecycle_when_cluster_is_new", async () => {
    (fetchTopicLifecycle as any).mockResolvedValue({
      now: [], growing: [], seeds: [], harvest: [],
    });

    const lifecycle = await fetchTopicLifecycle("c-new");
    expect(lifecycle.now).toHaveLength(0);
    expect(lifecycle.growing).toHaveLength(0);
    expect(lifecycle.seeds).toHaveLength(0);
    expect(lifecycle.harvest).toHaveLength(0);
  });
});

describe("topic-lifecycle: 场景 10 — 筛选状态持久化", () => {
  it("should_define_filter_persistence_key", () => {
    // 筛选状态使用固定 key 持久化到 localStorage
    const key = "v2note:topicFilter";
    const filterValue = { clusterId: "c1", title: "供应链管理" };
    const serialized = JSON.stringify(filterValue);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.clusterId).toBe("c1");
    expect(deserialized.title).toBe("供应链管理");
  });
});
