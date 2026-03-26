/**
 * advisor-context 测试 — 参谋上下文合并
 *
 * 覆盖 spec 5 个场景：
 * 1. 目标详情"深入讨论"注入完整上下文
 * 2. 普通 chat 调用认知数据（关键词检测 + cluster 注入）
 * 3. 展开讨论（矛盾上下文）
 * 4. 引用区分原声和素材
 * 5. 对话保存为日记
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted 确保 mock 变量在 vi.mock factory 之前初始化
const { mockQuery, mockRecordRepo, mockGoalRepo, mockTodoRepo, mockTranscriptRepo, mockHybridRetrieve, mockDigestRecords } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue([]),
  mockRecordRepo: {
    create: vi.fn().mockResolvedValue({ id: "rec-new-1" }),
  },
  mockGoalRepo: {
    findById: vi.fn().mockResolvedValue(null),
  },
  mockTodoRepo: {
    findByGoalId: vi.fn().mockResolvedValue([]),
  },
  mockTranscriptRepo: {
    create: vi.fn().mockResolvedValue({ id: "t-1" }),
  },
  mockHybridRetrieve: vi.fn().mockResolvedValue([]),
  mockDigestRecords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

vi.mock("../db/repositories/index.js", () => ({
  recordRepo: mockRecordRepo,
  goalRepo: mockGoalRepo,
  todoRepo: mockTodoRepo,
  transcriptRepo: mockTranscriptRepo,
}));

vi.mock("./retrieval.js", () => ({
  hybridRetrieve: (...args: any[]) => mockHybridRetrieve(...args),
}));

vi.mock("../handlers/digest.js", () => ({
  digestRecords: (...args: any[]) => mockDigestRecords(...args),
}));

import {
  detectCognitiveQuery,
  loadChatCognitive,
  buildGoalDiscussionContext,
  buildInsightDiscussionContext,
  formatCitation,
  saveConversationAsRecord,
} from "./advisor-context.js";

beforeEach(() => {
  vi.resetAllMocks();
  mockQuery.mockResolvedValue([]);
  mockRecordRepo.create.mockResolvedValue({ id: "rec-new-1" });
  mockTranscriptRepo.create.mockResolvedValue({ id: "t-1" });
  mockDigestRecords.mockResolvedValue(undefined);
});

// ─── 场景 2: 普通 chat 调用认知数据 ───

describe("detectCognitiveQuery", () => {
  it("should_detect_cognitive_keywords_最近在想", () => {
    expect(detectCognitiveQuery("我最近在想什么")).toBe(true);
  });

  it("should_detect_cognitive_keywords_关注", () => {
    expect(detectCognitiveQuery("我最近关注什么")).toBe(true);
  });

  it("should_detect_cognitive_keywords_焦点", () => {
    expect(detectCognitiveQuery("我的焦点是什么")).toBe(true);
  });

  it("should_not_detect_normal_message", () => {
    expect(detectCognitiveQuery("帮我写一封邮件")).toBe(false);
  });

  it("should_not_detect_empty_message", () => {
    expect(detectCognitiveQuery("")).toBe(false);
  });
});

describe("loadChatCognitive", () => {
  it("should_return_top3_active_clusters_by_7day_strike_count", async () => {
    // 模拟 top-3 clusters 查询
    mockQuery.mockResolvedValueOnce([
      { id: "c1", nucleus: "供应链管理", member_count: "12" },
      { id: "c2", nucleus: "团队建设", member_count: "8" },
      { id: "c3", nucleus: "产品策略", member_count: "5" },
    ]);
    // 模拟 alerts 查询（空）
    mockQuery.mockResolvedValueOnce([]);

    const result = await loadChatCognitive("user-1");

    expect(result.clusters).toHaveLength(3);
    expect(result.clusters[0].name).toBe("供应链管理");
    expect(result.clusters[0].recentStrikeCount).toBe(12);
  });

  it("should_include_recent_contradiction_alerts", async () => {
    // clusters
    mockQuery.mockResolvedValueOnce([]);
    // contradictions
    mockQuery.mockResolvedValueOnce([
      {
        a_id: "s1", a_nucleus: "供应商A质量好", a_polarity: "judge",
        b_id: "s2", b_nucleus: "供应商A交期不稳定", b_polarity: "judge",
        bond_id: "b1",
      },
    ]);

    const result = await loadChatCognitive("user-1");

    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].strikeA.nucleus).toBe("供应商A质量好");
  });

  it("should_format_as_injectable_context_string", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: "c1", nucleus: "供应链管理", member_count: "12" },
    ]);
    mockQuery.mockResolvedValueOnce([]);

    const result = await loadChatCognitive("user-1");

    expect(result.contextString).toContain("供应链管理");
    expect(typeof result.contextString).toBe("string");
  });
});

// ─── 场景 1: 目标详情"深入讨论" ───

describe("buildGoalDiscussionContext", () => {
  it("should_include_goal_strike_bond_chain", async () => {
    mockGoalRepo.findById.mockResolvedValueOnce({
      id: "goal-1",
      title: "提升供应链效率",
      cluster_id: "cluster-1",
      status: "active",
    });

    // cluster members (strikes)
    mockQuery.mockResolvedValueOnce([
      { id: "s1", nucleus: "供应商评估标准需要统一", polarity: "realize", created_at: "2026-03-20", source_id: "rec-1" },
      { id: "s2", nucleus: "物流成本过高", polarity: "judge", created_at: "2026-03-18", source_id: "rec-2" },
    ]);
    // contradictions
    mockQuery.mockResolvedValueOnce([]);
    // todo completion stats
    mockTodoRepo.findByGoalId.mockResolvedValueOnce([
      { id: "t1", done: true },
      { id: "t2", done: false },
    ]);

    const ctx = await buildGoalDiscussionContext("goal-1", "user-1");

    expect(ctx).toContain("提升供应链效率");
    expect(ctx).toContain("[record:rec-1]");
    expect(ctx).toContain("供应商评估标准需要统一");
    expect(ctx).toContain("完成率");
  });

  it("should_include_contradiction_alerts_for_goal", async () => {
    mockGoalRepo.findById.mockResolvedValueOnce({
      id: "goal-1",
      title: "提升供应链效率",
      cluster_id: "cluster-1",
      status: "active",
    });

    // cluster members
    mockQuery.mockResolvedValueOnce([
      { id: "s1", nucleus: "降低成本", polarity: "intend", created_at: "2026-03-20", source_id: "rec-1" },
    ]);
    // contradictions for cluster strikes
    mockQuery.mockResolvedValueOnce([
      { a_nucleus: "降低成本优先", b_nucleus: "质量不能妥协" },
    ]);
    // todos
    mockTodoRepo.findByGoalId.mockResolvedValueOnce([]);

    const ctx = await buildGoalDiscussionContext("goal-1", "user-1");

    expect(ctx).toContain("降低成本优先");
    expect(ctx).toContain("质量不能妥协");
  });

  it("should_return_minimal_context_when_goal_has_no_cluster", async () => {
    mockGoalRepo.findById.mockResolvedValueOnce({
      id: "goal-1",
      title: "学英语",
      cluster_id: null,
      status: "active",
    });

    const ctx = await buildGoalDiscussionContext("goal-1", "user-1");

    expect(ctx).toContain("学英语");
    // 没有 cluster 就不应有实际的 record 引用（[record:rec-xxx]）
    expect(ctx).not.toMatch(/\[record:rec-/);
  });
});

// ─── 场景 3: 展开讨论 ───

describe("buildInsightDiscussionContext", () => {
  it("should_include_both_sides_of_contradiction", async () => {
    // 查询矛盾双方 + 相关 cluster 成员
    mockQuery
      // 矛盾 bond + strikes
      .mockResolvedValueOnce([{
        bond_id: "b1",
        a_id: "s1", a_nucleus: "远程办公效率更高", a_polarity: "judge", a_created_at: "2026-03-10", a_source_id: "rec-1",
        b_id: "s2", b_nucleus: "面对面协作不可替代", b_polarity: "judge", b_created_at: "2026-03-15", b_source_id: "rec-2",
      }])
      // 相关 cluster 成员
      .mockResolvedValueOnce([
        { id: "s3", nucleus: "混合办公可能是折中方案", polarity: "realize", created_at: "2026-03-18", source_id: "rec-3" },
      ]);

    const ctx = await buildInsightDiscussionContext("b1", "user-1");

    expect(ctx).toContain("远程办公效率更高");
    expect(ctx).toContain("面对面协作不可替代");
    expect(ctx).toContain("2026-03-10");
    expect(ctx).toContain("2026-03-15");
  });

  it("should_include_related_cluster_members", async () => {
    mockQuery
      .mockResolvedValueOnce([{
        bond_id: "b1",
        a_id: "s1", a_nucleus: "A观点", a_polarity: "judge", a_created_at: "2026-03-10", a_source_id: "rec-1",
        b_id: "s2", b_nucleus: "B观点", b_polarity: "judge", b_created_at: "2026-03-15", b_source_id: "rec-2",
      }])
      .mockResolvedValueOnce([
        { id: "s3", nucleus: "C补充", polarity: "perceive", created_at: "2026-03-18", source_id: "rec-3" },
      ]);

    const ctx = await buildInsightDiscussionContext("b1", "user-1");

    expect(ctx).toContain("C补充");
    expect(ctx).toContain("[record:rec-3]");
  });
});

// ─── 场景 4: 引用区分原声和素材 ───

describe("formatCitation", () => {
  it("should_format_diary_citation_with_notebook_icon", () => {
    const result = formatCitation({
      id: "rec-1",
      source_type: "think",
      text: "我觉得供应链需要优化",
      created_at: "2026-03-20T10:00:00Z",
    });

    expect(result).toContain("📝");
    expect(result).toContain("你说过");
    expect(result).toContain("2026-03-20");
    expect(result).toContain("[record:rec-1]");
  });

  it("should_format_material_citation_with_doc_icon", () => {
    const result = formatCitation({
      id: "rec-2",
      source_type: "material",
      text: "报告显示市场份额下降",
      created_at: "2026-03-18T10:00:00Z",
    });

    expect(result).toContain("📄");
    expect(result).toContain("报告中提到");
    expect(result).toContain("[record:rec-2]");
  });

  it("should_format_voice_citation_as_diary", () => {
    const result = formatCitation({
      id: "rec-3",
      source_type: "voice",
      text: "今天开了个会讨论方案",
      created_at: "2026-03-19T10:00:00Z",
    });

    expect(result).toContain("📝");
    expect(result).toContain("你说过");
  });
});

// ─── 场景 5: 对话保存为日记 ───

describe("saveConversationAsRecord", () => {
  it("should_create_record_with_source_type_think", async () => {
    const messages = [
      { role: "user", content: "帮我分析一下供应链问题" },
      { role: "assistant", content: "根据你之前的记录，供应链有三个关键痛点..." },
    ];

    const recordId = await saveConversationAsRecord(messages, "user-1", "device-1");

    expect(mockRecordRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        device_id: "device-1",
        source_type: "think",
      }),
    );
    // transcript 应存储实际文本
    expect(mockTranscriptRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        record_id: "rec-new-1",
        text: expect.stringContaining("供应链"),
      }),
    );
    expect(recordId).toBe("rec-new-1");
  });

  it("should_trigger_digest_pipeline", async () => {
    const messages = [
      { role: "user", content: "讨论目标" },
      { role: "assistant", content: "你的目标是..." },
    ];

    await saveConversationAsRecord(messages, "user-1", "device-1");

    expect(mockDigestRecords).toHaveBeenCalledWith(
      ["rec-new-1"],
      { deviceId: "device-1", userId: "user-1" },
    );
  });

  it("should_summarize_conversation_in_record_text", async () => {
    const messages = [
      { role: "user", content: "我最近在想职业发展" },
      { role: "assistant", content: "根据记录你一直关注供应链领域" },
      { role: "user", content: "对，我想转型做咨询" },
    ];

    await saveConversationAsRecord(messages, "user-1", "device-1");

    const transcriptArgs = mockTranscriptRepo.create.mock.calls[0][0];
    // transcript text 应包含对话摘要内容
    expect(transcriptArgs.text).toBeDefined();
    expect(transcriptArgs.text).toContain("职业发展");
    expect(transcriptArgs.text).toContain("路路");  // assistant 前缀
  });
});
