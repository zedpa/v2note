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
  it("should_return_top3_wiki_pages_as_clusters", async () => {
    // 模拟 wiki_page 查询（替代旧的 cluster 查询）
    mockQuery.mockResolvedValueOnce([
      { id: "wp1", title: "供应链管理", summary: "供应链优化笔记", content: "供应链内容" },
      { id: "wp2", title: "团队建设", summary: "团队管理", content: "团队内容" },
      { id: "wp3", title: "产品策略", summary: "产品方向", content: "产品内容" },
    ]);

    const result = await loadChatCognitive("user-1");

    expect(result.clusters).toHaveLength(3);
    expect(result.clusters[0].name).toBe("供应链管理");
    expect(result.clusters[0].recentStrikeCount).toBe(0); // wiki 模式不统计 strike
  });

  it("should_extract_contradictions_from_wiki_content", async () => {
    // wiki 页面内容中包含矛盾/变化标记
    mockQuery.mockResolvedValueOnce([
      {
        id: "wp1", title: "供应商评估", summary: null,
        content: "之前认为供应商A质量好，后来发现交期不稳定\n其他一般内容",
      },
    ]);

    const result = await loadChatCognitive("user-1");

    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].strikeA.nucleus).toContain("供应商A质量好");
  });

  it("should_format_as_injectable_context_string", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: "wp1", title: "供应链管理", summary: "供应链优化", content: "普通内容" },
    ]);

    const result = await loadChatCognitive("user-1");

    expect(result.contextString).toContain("供应链管理");
    expect(typeof result.contextString).toBe("string");
  });
});

// ─── 场景 1: 目标详情"深入讨论" ───

describe("buildGoalDiscussionContext", () => {
  it("should_include_goal_info_and_wiki_knowledge", async () => {
    mockGoalRepo.findById.mockResolvedValueOnce({
      id: "goal-1",
      title: "提升供应链效率",
      cluster_id: "cluster-1",
      status: "active",
    });

    // wiki_page ILIKE 查询结果
    mockQuery.mockResolvedValueOnce([
      { id: "wp1", title: "供应链优化", content: "供应商评估标准需要统一\n物流成本过高", summary: "供应链相关知识" },
    ]);
    // todo completion stats
    mockTodoRepo.findByGoalId.mockResolvedValueOnce([
      { id: "t1", done: true },
      { id: "t2", done: false },
    ]);

    const ctx = await buildGoalDiscussionContext("goal-1", "user-1");

    expect(ctx).toContain("提升供应链效率");
    expect(ctx).toContain("供应链优化");
    expect(ctx).toContain("完成率");
  });

  it("should_include_wiki_summaries_for_goal", async () => {
    mockGoalRepo.findById.mockResolvedValueOnce({
      id: "goal-1",
      title: "提升供应链效率",
      cluster_id: "cluster-1",
      status: "active",
    });

    // wiki pages with summaries
    mockQuery.mockResolvedValueOnce([
      { id: "wp1", title: "成本控制", content: "降低成本优先\n质量不能妥协", summary: "成本与质量平衡" },
    ]);
    // todos
    mockTodoRepo.findByGoalId.mockResolvedValueOnce([]);

    const ctx = await buildGoalDiscussionContext("goal-1", "user-1");

    expect(ctx).toContain("成本控制");
    expect(ctx).toContain("成本与质量平衡");
  });

  it("should_return_minimal_context_when_no_wiki_pages", async () => {
    mockGoalRepo.findById.mockResolvedValueOnce({
      id: "goal-1",
      title: "学英语",
      cluster_id: null,
      status: "active",
    });

    // wiki 查询返回空
    mockQuery.mockResolvedValueOnce([]);
    // todos
    mockTodoRepo.findByGoalId.mockResolvedValueOnce([]);

    const ctx = await buildGoalDiscussionContext("goal-1", "user-1");

    expect(ctx).toContain("学英语");
    // 没有 wiki 就不应有"相关知识"段落
    expect(ctx).not.toContain("相关知识");
  });
});

// ─── 场景 3: 展开讨论 ───

describe("buildInsightDiscussionContext", () => {
  it("should_return_wiki_page_content_when_found", async () => {
    // wiki_page 查询返回匹配页面
    mockQuery.mockResolvedValueOnce([{
      id: "wp1",
      title: "远程办公思考",
      content: "远程办公效率更高\n但面对面协作不可替代\n混合办公是折中方案",
      summary: "远程 vs 面对面",
    }]);

    const ctx = await buildInsightDiscussionContext("wp1", "user-1");

    expect(ctx).toContain("远程办公思考");
    expect(ctx).toContain("远程办公效率更高");
    expect(ctx).toContain("面对面协作不可替代");
  });

  it("should_return_fallback_when_page_not_found", async () => {
    // wiki_page 查询返回空
    mockQuery.mockResolvedValueOnce([]);

    const ctx = await buildInsightDiscussionContext("non-existent", "user-1");

    expect(ctx).toContain("未找到");
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
