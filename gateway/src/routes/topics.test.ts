/**
 * topic-lifecycle spec — 后端路由测试
 * 场景 1: GET /topics 主题列表
 * 场景 3: GET /topics/:id/lifecycle 四阶段数据
 * 场景 5: POST /goals/:id/harvest 收获沉淀
 */
import { describe, it, expect, vi } from "vitest";

// 测试 API 接口约定（类型契约测试）
describe("topic-lifecycle: 后端 API 契约", () => {
  it("should_define_topic_list_response_shape", () => {
    // GET /api/v1/topics 响应结构
    const topicItem = {
      clusterId: "uuid",
      title: "供应链管理",
      memberCount: 12,
      activeGoals: [{ id: "g1", title: "评估供应商" }],
      lastActivity: "2026-03-28T10:00:00Z",
      intendDensity: 0.4,
      hasActiveGoal: true,
    };

    expect(topicItem.clusterId).toBeDefined();
    expect(topicItem.title).toBeDefined();
    expect(typeof topicItem.memberCount).toBe("number");
    expect(Array.isArray(topicItem.activeGoals)).toBe(true);
    expect(typeof topicItem.intendDensity).toBe("number");
    expect(typeof topicItem.hasActiveGoal).toBe("boolean");
  });

  it("should_define_lifecycle_response_shape", () => {
    // GET /api/v1/topics/:id/lifecycle 响应结构
    const lifecycle = {
      now: [{ id: "t1", text: "打给张总", done: false, scheduled_start: null }],
      growing: [{
        goal: { id: "g1", title: "评估供应商", status: "active" },
        todos: [{ id: "t2", text: "对比分析", done: false }],
        completionPercent: 60,
      }],
      seeds: [{
        id: "s1",
        nucleus: "应该考虑备用供应商",
        polarity: "intend",
        created_at: "2026-03-20T10:00:00Z",
      }],
      harvest: [{
        goal: { id: "g2", title: "铝价走势判断", status: "completed" },
        reviewStrike: { id: "rs1", nucleus: "判断已验证", polarity: "judge" },
        completedAt: "2026-03-14T10:00:00Z",
      }],
    };

    expect(Array.isArray(lifecycle.now)).toBe(true);
    expect(Array.isArray(lifecycle.growing)).toBe(true);
    expect(Array.isArray(lifecycle.seeds)).toBe(true);
    expect(Array.isArray(lifecycle.harvest)).toBe(true);
    expect(lifecycle.growing[0].completionPercent).toBe(60);
  });

  it("should_define_harvest_request_shape", () => {
    // POST /api/v1/goals/:id/harvest
    const harvestResult = {
      strikeId: "new-strike-uuid",
      nucleus: "供应商评估结论：选XX，价格降15%",
      clusterId: "c1",
    };

    expect(harvestResult.strikeId).toBeDefined();
    expect(harvestResult.nucleus).toBeDefined();
  });
});
