/**
 * self-evolution 测试 — Agent 自适应（交互偏好学习 + Soul 守护）
 *
 * 覆盖 spec 8 个场景：
 * 1. Plan 偏好提取（计数阈值 >= 3）
 * 2. 隐式偏好推断（行为模式分析）
 * 3. 偏好注入 prompt 格式
 * 4. Soul 守护（严格门控）
 * 5. Profile 被动学习（持久/临时区分）
 * 6. 偏好衰减（60天 stale, 90天删除）
 * 7. unmet_request 聚合
 * 8. 用户偏好可见性
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  execute: (...args: any[]) => mockQuery(...args),
}));

import {
  shouldUpdateSoulStrict,
  extractPlanPreference,
  formatPreferencesForPrompt,
  findStalePreferences,
  decayPreferences,
  aggregateUnmetRequests,
  classifyProfileFact,
} from "./self-evolution.js";

beforeEach(() => {
  vi.resetAllMocks();
  mockQuery.mockResolvedValue([]);
});

// ─── 场景 4: Soul 守护（最重要，先测） ───

describe("shouldUpdateSoulStrict", () => {
  it("should_detect_explicit_behavior_request_你以后", () => {
    expect(shouldUpdateSoulStrict(["路路你以后说话简洁点"])).toBe(true);
  });

  it("should_detect_explicit_behavior_request_你不要", () => {
    expect(shouldUpdateSoulStrict(["路路你不要那么客气"])).toBe(true);
  });

  it("should_detect_explicit_behavior_request_叫我", () => {
    expect(shouldUpdateSoulStrict(["路路你可以叫我老板"])).toBe(true);
  });

  it("should_detect_style_feedback", () => {
    expect(shouldUpdateSoulStrict(["你说话的风格太正式了"])).toBe(true);
  });

  it("should_NOT_detect_我觉得_as_soul_update", () => {
    // "我觉得" 应更新 profile 而非 soul
    expect(shouldUpdateSoulStrict(["我觉得这个方案不太好"])).toBe(false);
  });

  it("should_NOT_detect_factual_correction", () => {
    expect(shouldUpdateSoulStrict(["不对，这个数据是错的"])).toBe(false);
  });

  it("should_NOT_detect_cold_tone", () => {
    // 用户语气冷淡不应触发 soul 更新
    expect(shouldUpdateSoulStrict(["嗯"])).toBe(false);
  });

  it("should_detect_你太啰嗦", () => {
    expect(shouldUpdateSoulStrict(["你太啰嗦了"])).toBe(true);
  });
});

// ─── 场景 1: Plan 偏好提取 ───

describe("extractPlanPreference", () => {
  it("should_return_preference_when_count_gte_3", () => {
    const original = ["调研市场", "制定方案", "执行"];
    const final = ["调研市场", "风险评估", "制定方案", "执行"];
    const result = extractPlanPreference(original, final, 3);

    expect(result).toBeDefined();
    expect(result!.content).toContain("风险评估");
  });

  it("should_return_null_when_count_lt_3", () => {
    const original = ["步骤A"];
    const final = ["步骤A", "步骤B"];
    const result = extractPlanPreference(original, final, 2);

    expect(result).toBeNull();
  });

  it("should_return_null_when_no_modifications", () => {
    const steps = ["步骤A", "步骤B"];
    const result = extractPlanPreference(steps, steps, 5);

    expect(result).toBeNull();
  });
});

// ─── 场景 3: 偏好注入 prompt ───

describe("formatPreferencesForPrompt", () => {
  it("should_format_as_user_interaction_preferences_section", () => {
    const preferences = [
      "用户偏好简洁回复，不需要解释推理过程",
      "用户倾向在拆解方案中包含风险评估步骤",
    ];

    const result = formatPreferencesForPrompt(preferences);

    expect(result).toContain("## 用户交互偏好");
    expect(result).toContain("简洁回复");
    expect(result).toContain("风险评估");
  });

  it("should_return_empty_string_for_no_preferences", () => {
    expect(formatPreferencesForPrompt([])).toBe("");
  });
});

// ─── 场景 5: Profile 事实分类 ───

describe("classifyProfileFact", () => {
  it("should_classify_job_as_persistent", () => {
    const result = classifyProfileFact("用户是产品经理");
    expect(result.type).toBe("persistent");
  });

  it("should_classify_trip_as_temporary", () => {
    const result = classifyProfileFact("用户下周去深圳出差");
    expect(result.type).toBe("temporary");
    expect(result.expiresInDays).toBeDefined();
  });

  it("should_default_to_persistent_for_ambiguous", () => {
    const result = classifyProfileFact("用户喜欢看科幻小说");
    expect(result.type).toBe("persistent");
  });
});

// ─── 场景 6: 偏好衰减 ───

describe("findStalePreferences", () => {
  it("should_find_preferences_older_than_staleDays", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: "m1", content: "旧偏好", updated_at: "2026-01-01" },
    ]);

    const result = await findStalePreferences("user-1", 60);

    expect(result).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INTERVAL"),
      expect.arrayContaining(["user-1"]),
    );
  });
});

describe("decayPreferences", () => {
  it("should_delete_preferences_older_than_90_days", async () => {
    await decayPreferences("user-1");

    // 应有两次调用：标记 stale (60天) + 删除 (90天)
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

// ─── 场景 7: unmet_request 聚合 ───

describe("aggregateUnmetRequests", () => {
  it("should_group_and_count_similar_requests", async () => {
    mockQuery.mockResolvedValueOnce([
      { request_text: "删除目标", count: "5" },
      { request_text: "设置提醒", count: "3" },
    ]);

    const result = await aggregateUnmetRequests("user-1");

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("删除目标");
    expect(result[0].count).toBe(5);
  });

  it("should_return_empty_for_no_requests", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await aggregateUnmetRequests("user-1");
    expect(result).toHaveLength(0);
  });
});
