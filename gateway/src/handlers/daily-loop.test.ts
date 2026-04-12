import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 测试 daily-loop 中 scheduled_start 的类型安全处理
 * 根因：PostgreSQL pg 驱动对 timestamp 列返回 Date 对象，
 * 代码假设是 string 调用 .startsWith() 导致 TypeError
 */

// 提取为独立可测试的工具函数
import { toLocalDateStr } from "./daily-loop.js";

describe("toLocalDateStr — 本地日期转换（Asia/Shanghai）", () => {
  it("should_return_local_date_when_given_Date_object", () => {
    // 2026-04-02T09:00:00Z = 2026-04-02 17:00 Beijing
    const date = new Date("2026-04-02T09:00:00Z");
    const result = toLocalDateStr(date);
    expect(result).toBe("2026-04-02");
  });

  it("should_return_local_date_when_given_UTC_near_midnight", () => {
    // 2026-04-02T20:00:00Z = 2026-04-03 04:00 Beijing → should be "2026-04-03"
    const date = new Date("2026-04-02T20:00:00Z");
    const result = toLocalDateStr(date);
    expect(result).toBe("2026-04-03");
  });

  it("should_return_local_date_when_given_ISO_string", () => {
    const result = toLocalDateStr("2026-04-02T09:00:00Z");
    expect(result).toBe("2026-04-02");
  });

  it("should_return_null_when_given_null", () => {
    expect(toLocalDateStr(null)).toBeNull();
  });

  it("should_return_null_when_given_undefined", () => {
    expect(toLocalDateStr(undefined)).toBeNull();
  });

  it("should_enable_date_equality_filtering_for_Date_objects", () => {
    const todos = [
      { text: "A", scheduled_start: new Date("2026-04-02T09:00:00Z") },   // Beijing: 04-02
      { text: "B", scheduled_start: new Date("2026-04-03T10:00:00Z") },   // Beijing: 04-03
      { text: "C", scheduled_start: null },
      { text: "D", scheduled_start: "2026-04-02T14:00:00Z" },             // Beijing: 04-02
    ];

    const today = "2026-04-02";
    const filtered = todos.filter((t) =>
      toLocalDateStr(t.scheduled_start) === today,
    );

    expect(filtered.map((t) => t.text)).toEqual(["A", "D"]);
  });

  it("should_correctly_handle_UTC_midnight_crossover", () => {
    const todos = [
      { scheduled_start: new Date("2026-04-01T16:00:00Z") },  // Beijing: 04-02 00:00
      { scheduled_start: new Date("2026-04-01T15:59:59Z") },  // Beijing: 04-01 23:59
      { scheduled_start: "2026-04-02T00:00:00+08:00" },       // Beijing: 04-02
    ];

    const today = "2026-04-02";
    const count = todos.filter((t) =>
      toLocalDateStr(t.scheduled_start) === today,
    ).length;

    expect(count).toBe(2); // first and third
  });
});

// ── Mock 所有外部依赖 ──

vi.mock("../ai/provider.js", () => ({
  chatCompletion: vi.fn(),
}));
vi.mock("../db/repositories/index.js", () => ({
  todoRepo: {
    findPendingByUser: vi.fn().mockResolvedValue([]),
    findPendingByDevice: vi.fn().mockResolvedValue([]),
    findByUser: vi.fn().mockResolvedValue([]),
    findByDevice: vi.fn().mockResolvedValue([]),
    findCompletedByUserInRange: vi.fn().mockResolvedValue([]),
    findCompletedByDeviceInRange: vi.fn().mockResolvedValue([]),
    countByUserDateRange: vi.fn().mockResolvedValue({ done: 0, total: 0 }),
    countByDateRange: vi.fn().mockResolvedValue({ done: 0, total: 0 }),
    findByGoalId: vi.fn().mockResolvedValue([]),
  },
  recordRepo: {
    findByUser: vi.fn().mockResolvedValue([]),
    findByDevice: vi.fn().mockResolvedValue([]),
    findByUserAndDateRange: vi.fn().mockResolvedValue([]),
  },
  goalRepo: {
    findActiveByUser: vi.fn().mockResolvedValue([]),
    findActiveByDevice: vi.fn().mockResolvedValue([]),
    findTodosByGoalIds: vi.fn().mockResolvedValue([]),
  },
  transcriptRepo: {
    findByRecordIds: vi.fn().mockResolvedValue([]),
  },
  userAgentRepo: {
    findByUser: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("../db/repositories/daily-briefing.js", () => ({
  findByUserAndDate: vi.fn().mockResolvedValue(null),
  findByDeviceAndDate: vi.fn().mockResolvedValue(null),
  upsert: vi.fn().mockResolvedValue({}),
}));
vi.mock("../soul/manager.js", () => ({
  loadSoul: vi.fn().mockResolvedValue(null),
}));
vi.mock("../profile/manager.js", () => ({
  loadProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock("./chat-daily-diary.js", () => ({
  generateChatDiary: vi.fn().mockResolvedValue(undefined),
}));
// Mock loadWarmContext — 替代直接的 loadSoul/loadProfile 调用
vi.mock("../context/loader.js", () => ({
  loadWarmContext: vi.fn().mockResolvedValue({
    soul: undefined,
    userProfile: undefined,
    userAgent: undefined,
    memories: [],
    rawMemories: [],
    goals: [],
    wikiContext: undefined,
  }),
}));
// Mock buildSystemPrompt
vi.mock("../skills/prompt-builder.js", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("mocked-system-prompt"),
}));

import { generateMorningBriefing, generateEveningSummary, isBriefingDisabled } from "./daily-loop.js";
import { chatCompletion } from "../ai/provider.js";
import * as briefingRepo from "../db/repositories/daily-briefing.js";
import { todoRepo, recordRepo, goalRepo, transcriptRepo, userAgentRepo } from "../db/repositories/index.js";
import { loadWarmContext } from "../context/loader.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";

const mockedChatCompletion = vi.mocked(chatCompletion);
const mockedFindByDeviceAndDate = vi.mocked(briefingRepo.findByDeviceAndDate);
const mockedFindByUserAndDate = vi.mocked(briefingRepo.findByUserAndDate);
const mockedUpsert = vi.mocked(briefingRepo.upsert);
const mockedLoadWarmContext = vi.mocked(loadWarmContext);
const mockedBuildSystemPrompt = vi.mocked(buildSystemPrompt);
const mockedCountByUserDateRange = vi.mocked(todoRepo.countByUserDateRange);

// ── 场景 1.1: 早报接入 v2 prompt 架构 ──

describe("场景 1.1: 早报接入 v2 prompt 架构", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好，新的一天",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_call_loadWarmContext_with_briefing_mode_when_generating_morning_briefing", async () => {
    await generateMorningBriefing("device-1", "user-1");

    expect(mockedLoadWarmContext).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "user-1",
        userId: "user-1",
        mode: "briefing",
      }),
    );
  });

  it("should_call_buildSystemPrompt_with_briefing_agent_when_generating_morning_briefing", async () => {
    mockedLoadWarmContext.mockResolvedValue({
      soul: "温柔的灵魂",
      userProfile: "产品经理",
      userAgent: "晨间简报: 开启",
      memories: ["记忆1"],
      rawMemories: [],
      goals: [],
      wikiContext: ["知识1"],
    });

    await generateMorningBriefing("device-1", "user-1");

    expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "briefing",
        soul: "温柔的灵魂",
        userAgent: "晨间简报: 开启",
        userProfile: "产品经理",
        memory: ["记忆1"],
      }),
    );
  });

  it("should_inject_full_soul_without_truncation_when_soul_is_available", async () => {
    // Soul 超过 200 字时不应被截断
    const longSoul = "A".repeat(500);
    mockedLoadWarmContext.mockResolvedValue({
      soul: longSoul,
      userProfile: undefined,
      userAgent: undefined,
      memories: [],
      rawMemories: [],
      goals: [],
    });

    await generateMorningBriefing("device-1", "user-1");

    // buildSystemPrompt 收到完整 soul
    expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        soul: longSoul,
      }),
    );
  });

  it("should_inject_memory_and_wiki_when_available", async () => {
    mockedLoadWarmContext.mockResolvedValue({
      soul: "灵魂",
      userProfile: "画像",
      userAgent: "规则",
      memories: ["记忆A", "记忆B", "记忆C"],
      rawMemories: [],
      goals: [],
      wikiContext: ["知识X", "知识Y"],
    });

    await generateMorningBriefing("device-1", "user-1");

    expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: ["记忆A", "记忆B", "记忆C"],
        wikiContext: ["知识X", "知识Y"],
      }),
    );
  });
});

// ── 场景 1.2: 早报包含进行中目标 ──

describe("场景 1.2: 早报包含进行中目标", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_include_goal_pulse_data_in_user_message_when_user_has_active_goals", async () => {
    // 准备活跃目标
    const mockedGoalFindActive = vi.mocked(goalRepo.findActiveByUser);
    mockedGoalFindActive.mockResolvedValue([
      { id: "g1", title: "学习 Rust", device_id: "d", user_id: "u", parent_id: null, status: "active" as const, source: "manual" as const, cluster_id: null, wiki_page_id: null, created_at: "", updated_at: "" },
      { id: "g2", title: "健身计划", device_id: "d", user_id: "u", parent_id: null, status: "progressing" as const, source: "manual" as const, cluster_id: null, wiki_page_id: null, created_at: "", updated_at: "" },
    ]);

    // 用批量查询的 findTodosByGoalIds
    const mockedFindTodosByGoalIds = vi.mocked(goalRepo.findTodosByGoalIds);
    mockedFindTodosByGoalIds.mockResolvedValue([
      { parent_id: "g1", id: "t1", text: "读第1章", done: true, completed_at: null },
      { parent_id: "g1", id: "t2", text: "读第2章", done: false, completed_at: null },
      { parent_id: "g1", id: "t3", text: "读第3章", done: false, completed_at: null },
      { parent_id: "g2", id: "t4", text: "跑步", done: true, completed_at: null },
      { parent_id: "g2", id: "t5", text: "游泳", done: true, completed_at: null },
    ]);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: ["读Rust第2章"],
        carry_over: [],
        goal_pulse: [
          { title: "学习 Rust", progress: "1/3" },
          { title: "健身计划", progress: "2/2" },
        ],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateMorningBriefing("device-1", "user-1");

    // 用户消息应包含目标脉搏段落
    const callArgs = mockedChatCompletion.mock.calls[0];
    const messages = callArgs[0];
    const userMsg = messages.find((m: any) => m.role === "user");
    expect(userMsg!.content).toContain("目标脉搏");
    expect(userMsg!.content).toContain("学习 Rust");
    expect(userMsg!.content).toContain("1/3");

    // 返回结果包含 goal_pulse
    expect(result!.goal_pulse).toBeDefined();
    expect(result!.goal_pulse).toHaveLength(2);
  });

  it("should_return_empty_goal_pulse_when_user_has_no_goals", async () => {
    vi.mocked(goalRepo.findActiveByUser).mockResolvedValue([]);
    vi.mocked(goalRepo.findTodosByGoalIds).mockResolvedValue([]);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
        // AI 没返回 goal_pulse
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateMorningBriefing("device-1", "user-1");
    // 默认值补充
    expect(result!.goal_pulse).toEqual([]);
  });

  it("should_limit_goals_to_5_when_user_has_many_active_goals", async () => {
    const goals = Array.from({ length: 8 }, (_, i) => ({
      id: `g${i}`, title: `目标${i}`, device_id: "d", user_id: "u",
      parent_id: null, status: "active" as const, source: "manual" as const,
      cluster_id: null, wiki_page_id: null, created_at: "", updated_at: "",
    }));
    vi.mocked(goalRepo.findActiveByUser).mockResolvedValue(goals);
    vi.mocked(goalRepo.findTodosByGoalIds).mockResolvedValue([]);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    await generateMorningBriefing("device-1", "user-1");

    // findTodosByGoalIds 只对前5个目标查询
    const callArgs = vi.mocked(goalRepo.findTodosByGoalIds).mock.calls[0];
    expect(callArgs[0]).toHaveLength(5);
  });
});

// ── 场景 1.4: 早报尊重 UserAgent 通知偏好 ──

describe("场景 1.4: 早报尊重 UserAgent 通知偏好", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_return_null_when_user_disabled_morning_briefing", async () => {
    vi.mocked(userAgentRepo.findByUser).mockResolvedValue({
      id: "ua1",
      user_id: "user-1",
      content: "## 通知偏好\n- 晨间简报: 关闭\n- 晚间回顾: 开启",
      template_version: 1,
      created_at: "",
      updated_at: "",
    });

    const result = await generateMorningBriefing("device-1", "user-1");
    // 返回 null 表示不生成
    expect(result).toBeNull();
    // AI 不应被调用
    expect(mockedChatCompletion).not.toHaveBeenCalled();
  });

  it("should_generate_normally_when_morning_briefing_is_enabled", async () => {
    vi.mocked(userAgentRepo.findByUser).mockResolvedValue({
      id: "ua1",
      user_id: "user-1",
      content: "## 通知偏好\n- 晨间简报: 开启\n- 晚间回顾: 开启",
      template_version: 1,
      created_at: "",
      updated_at: "",
    });

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateMorningBriefing("device-1", "user-1");
    expect(result).not.toBeNull();
    expect(mockedChatCompletion).toHaveBeenCalled();
  });

  it("should_generate_normally_when_no_userId_provided", async () => {
    // 无 userId 时不检查通知偏好
    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateMorningBriefing("device-1");
    expect(result).not.toBeNull();
  });

  it("should_default_to_generate_when_userAgent_check_fails", async () => {
    vi.mocked(userAgentRepo.findByUser).mockRejectedValue(new Error("DB error"));

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateMorningBriefing("device-1", "user-1");
    expect(result).not.toBeNull();
  });
});

// ── 场景 2.1: 晚报接入 v2 prompt 架构 ──

describe("场景 2.1: 晚报接入 v2 prompt 架构", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    process.env.TZ = "Asia/Shanghai";

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "充实的一天",
        accomplishments: [],
        insight: "今天的状态不错",
        affirmation: "你做得很好",
        tomorrow_preview: [],
        stats: { done: 0, new_records: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_call_loadWarmContext_with_briefing_mode_when_generating_evening_summary", async () => {
    await generateEveningSummary("device-1", "user-1");

    expect(mockedLoadWarmContext).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "user-1",
        userId: "user-1",
        mode: "briefing",
      }),
    );
  });

  it("should_call_buildSystemPrompt_with_briefing_agent_when_generating_evening_summary", async () => {
    mockedLoadWarmContext.mockResolvedValue({
      soul: "温暖灵魂",
      userProfile: "设计师",
      userAgent: "规则内容",
      memories: ["记忆1", "记忆2"],
      rawMemories: [],
      goals: [],
      wikiContext: ["wiki知识"],
    });

    await generateEveningSummary("device-1", "user-1");

    expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "briefing",
        soul: "温暖灵魂",
        userAgent: "规则内容",
        userProfile: "设计师",
        memory: ["记忆1", "记忆2"],
        wikiContext: ["wiki知识"],
      }),
    );
  });
});

// ── 场景 2.2: 晚报包含日记洞察 ──

describe("场景 2.2: 晚报包含日记洞察", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_load_today_diary_and_include_in_prompt_when_records_exist", async () => {
    // 准备今日记录
    vi.mocked(recordRepo.findByUserAndDateRange).mockResolvedValue([
      { id: "r1", device_id: "d", user_id: "u", created_at: "2026-04-08T10:00:00Z", source: "speech", archived: false },
      { id: "r2", device_id: "d", user_id: "u", created_at: "2026-04-08T14:00:00Z", source: "speech", archived: false },
    ] as any);

    vi.mocked(transcriptRepo.findByRecordIds).mockResolvedValue([
      { id: "t1", record_id: "r1", text: "今天上午开了个会议讨论产品方向", language: "zh", created_at: "" },
      { id: "t2", record_id: "r2", text: "下午写了两个小时代码", language: "zh", created_at: "" },
    ]);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "充实的一天",
        accomplishments: ["开会", "写代码"],
        insight: "你今天在产品思考和技术实现之间切换，效率很高",
        affirmation: "保持这种节奏",
        tomorrow_preview: [],
        stats: { done: 2, new_records: 2 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateEveningSummary("device-1", "user-1");

    // 用户消息中包含日记内容
    const callArgs = mockedChatCompletion.mock.calls[0];
    const messages = callArgs[0];
    const userMsg = messages.find((m: any) => m.role === "user");
    expect(userMsg!.content).toContain("日记");
    expect(userMsg!.content).toContain("今天上午开了个会议");

    // 结果包含 insight
    expect(result!.insight).toBe("你今天在产品思考和技术实现之间切换，效率很高");
  });

  it("should_truncate_diary_text_to_2000_chars_at_record_boundary", async () => {
    // 构造超长日记
    const longText1 = "A".repeat(1500);
    const longText2 = "B".repeat(800); // 总计 2300 > 2000

    vi.mocked(recordRepo.findByUserAndDateRange).mockResolvedValue([
      { id: "r1", device_id: "d", user_id: "u", created_at: "2026-04-08T10:00:00Z", source: "speech", archived: false },
      { id: "r2", device_id: "d", user_id: "u", created_at: "2026-04-08T14:00:00Z", source: "speech", archived: false },
    ] as any);

    vi.mocked(transcriptRepo.findByRecordIds).mockResolvedValue([
      { id: "t1", record_id: "r1", text: longText1, language: "zh", created_at: "" },
      { id: "t2", record_id: "r2", text: longText2, language: "zh", created_at: "" },
    ]);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "一天结束了",
        accomplishments: [],
        insight: "洞察",
        affirmation: "肯定",
        tomorrow_preview: [],
        stats: { done: 0, new_records: 2 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    await generateEveningSummary("device-1", "user-1");

    // 用户消息中应包含第一条记录但不包含第二条（超出 2000 字）
    const userMsg = mockedChatCompletion.mock.calls[0][0].find((m: any) => m.role === "user");
    expect(userMsg!.content).toContain(longText1);
    expect(userMsg!.content).not.toContain(longText2);
  });

  it("should_return_empty_insight_when_no_diary_records", async () => {
    vi.mocked(recordRepo.findByUserAndDateRange).mockResolvedValue([]);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "今天就这样了",
        accomplishments: [],
        tomorrow_preview: [],
        stats: { done: 0, new_records: 0 },
        // AI 没返回 insight
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateEveningSummary("device-1", "user-1");
    // 默认值
    expect(result!.insight).toBe("");
    expect(result!.affirmation).toBe("");
  });
});

// ── 场景 2.3 + 2.4: 晚报 JSON 输出格式（insight + affirmation） ──

describe("场景 2.3/2.4: 晚报包含 insight 和 affirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_include_insight_and_affirmation_in_result", async () => {
    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "不错的一天",
        accomplishments: ["完成了报告"],
        insight: "你今天花了很多时间在深度工作上",
        affirmation: "每一步小的进步都在积累",
        tomorrow_preview: ["继续写报告"],
        stats: { done: 1, new_records: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateEveningSummary("device-1", "user-1");
    expect(result!.insight).toBe("你今天花了很多时间在深度工作上");
    expect(result!.affirmation).toBe("每一步小的进步都在积累");
  });

  it("should_default_insight_and_affirmation_when_ai_omits_them", async () => {
    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "一天结束了",
        accomplishments: [],
        tomorrow_preview: [],
        stats: { done: 0, new_records: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateEveningSummary("device-1", "user-1");
    expect(result!.insight).toBe("");
    expect(result!.affirmation).toBe("");
  });
});

// ── 场景 2.5: 晚报尊重 UserAgent 通知偏好 ──

describe("场景 2.5: 晚报尊重 UserAgent 通知偏好", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_return_null_when_user_disabled_evening_review", async () => {
    vi.mocked(userAgentRepo.findByUser).mockResolvedValue({
      id: "ua1",
      user_id: "user-1",
      content: "## 通知偏好\n- 晨间简报: 开启\n- 晚间回顾: 关闭",
      template_version: 1,
      created_at: "",
      updated_at: "",
    });

    const result = await generateEveningSummary("device-1", "user-1");
    expect(result).toBeNull();
    expect(mockedChatCompletion).not.toHaveBeenCalled();
  });
});

// ── isBriefingDisabled 单元测试 ──

describe("isBriefingDisabled — UserAgent 通知偏好检查", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_return_false_when_no_userId", async () => {
    expect(await isBriefingDisabled(undefined, "晨间简报")).toBe(false);
  });

  it("should_return_true_when_content_contains_type_and_关闭", async () => {
    vi.mocked(userAgentRepo.findByUser).mockResolvedValue({
      id: "ua1",
      user_id: "user-1",
      content: "## 通知偏好\n- 晨间简报: 关闭\n- 晚间回顾: 开启",
      template_version: 1,
      created_at: "",
      updated_at: "",
    });
    expect(await isBriefingDisabled("user-1", "晨间简报")).toBe(true);
  });

  it("should_return_false_when_type_is_enabled", async () => {
    vi.mocked(userAgentRepo.findByUser).mockResolvedValue({
      id: "ua1",
      user_id: "user-1",
      content: "## 通知偏好\n- 晨间简报: 开启\n- 晚间回顾: 开启",
      template_version: 1,
      created_at: "",
      updated_at: "",
    });
    expect(await isBriefingDisabled("user-1", "晨间简报")).toBe(false);
  });

  it("should_return_false_when_userAgent_not_found", async () => {
    vi.mocked(userAgentRepo.findByUser).mockResolvedValue(null);
    expect(await isBriefingDisabled("user-1", "晨间简报")).toBe(false);
  });

  it("should_return_false_when_check_throws_error", async () => {
    vi.mocked(userAgentRepo.findByUser).mockRejectedValue(new Error("fail"));
    expect(await isBriefingDisabled("user-1", "晨间简报")).toBe(false);
  });
});

// ── 场景 1.3: 早报 JSON 输出格式 (goal_pulse 默认值) ──

describe("场景 1.3: 早报 goal_pulse 默认值处理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_default_goal_pulse_to_empty_array_when_ai_omits_it", async () => {
    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateMorningBriefing("device-1", "user-1");
    expect(result!.goal_pulse).toEqual([]);
  });
});

// ── regression: fix-morning-briefing — 保持旧的回归测试 ──

describe("regression: fix-morning-briefing — Bug 1: UTC 时区错位", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好，4月8日周三",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_use_local_date_2026_04_08_when_beijing_time_is_0730_utc_is_2330_prev_day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T23:30:00Z"));

    const origTZ = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";

    try {
      await generateMorningBriefing("device-1", "user-1");

      expect(mockedFindByUserAndDate).toHaveBeenCalledWith("user-1", "2026-04-08", "morning");
      expect(mockedUpsert).toHaveBeenCalledWith(
        "user-1",
        "2026-04-08",
        "morning",
        expect.any(Object),
        "user-1",
      );
    } finally {
      process.env.TZ = origTZ;
      vi.useRealTimers();
    }
  });

  it("should_calculate_yesterday_correctly_when_beijing_0730", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T23:30:00Z"));

    const origTZ = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";

    try {
      await generateMorningBriefing("device-1", "user-1");

      expect(mockedCountByUserDateRange).toHaveBeenCalledWith(
        "user-1",
        "2026-04-06T16:00:00.000Z",
        "2026-04-07T15:59:59.999Z",
      );
    } finally {
      process.env.TZ = origTZ;
      vi.useRealTimers();
    }
  });

  it("should_use_local_date_for_evening_summary_when_2000_beijing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));

    const origTZ = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "充实的一天",
        accomplishments: [],
        insight: "",
        affirmation: "",
        tomorrow_preview: [],
        stats: { done: 0, new_records: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    try {
      await generateEveningSummary("device-1", "user-1");

      expect(mockedFindByUserAndDate).toHaveBeenCalledWith("user-1", "2026-04-08", "evening");
      expect(mockedUpsert).toHaveBeenCalledWith(
        "user-1",
        "2026-04-08",
        "evening",
        expect.any(Object),
        "user-1",
      );
    } finally {
      process.env.TZ = origTZ;
      vi.useRealTimers();
    }
  });

  it("should_use_local_date_for_forceRefresh_at_midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T16:30:00Z"));

    const origTZ = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";

    try {
      await generateMorningBriefing("device-1", "user-1", true);

      expect(mockedFindByUserAndDate).not.toHaveBeenCalled();
      expect(mockedUpsert).toHaveBeenCalledWith(
        "user-1",
        "2026-04-08",
        "morning",
        expect.any(Object),
        "user-1",
      );
    } finally {
      process.env.TZ = origTZ;
      vi.useRealTimers();
    }
  });
});

describe("regression: fix-morning-briefing — Bug 2: 问候语基于待办+字数过紧", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好，4月8日，新的一天充满可能",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 3, yesterday_total: 5 },
      }),
      usage: { input: 100, output: 50 },
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_include_soul_and_profile_in_prompt_when_available", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));

    const origTZ = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";

    // 通过 loadWarmContext 注入 soul/profile
    mockedLoadWarmContext.mockResolvedValue({
      soul: "喜欢简洁务实的沟通",
      userProfile: "产品经理，关注效率",
      userAgent: undefined,
      memories: [],
      rawMemories: [],
      goals: [],
    });

    try {
      await generateMorningBriefing("device-1", "user-1");

      // buildSystemPrompt 被调用时包含 soul 和 profile
      expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          soul: "喜欢简洁务实的沟通",
          userProfile: "产品经理，关注效率",
        }),
      );

      // system prompt 来自 buildSystemPrompt 的返回值
      const callArgs = mockedChatCompletion.mock.calls[0];
      const messages = callArgs[0];
      const systemMsg = messages.find((m: any) => m.role === "system");
      // 应包含 buildSystemPrompt 返回值 + briefing 特定指令
      expect(systemMsg).toBeDefined();
    } finally {
      process.env.TZ = origTZ;
      vi.useRealTimers();
    }
  });
});

// ── 场景 3.1: briefing.md 正确注入 ──

describe("场景 3.1: briefing agent 激活", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_pass_agent_briefing_to_buildSystemPrompt", async () => {
    await generateMorningBriefing("device-1", "user-1");

    expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "briefing",
      }),
    );
  });
});

// ── regression: fix-briefing-stale-todos — 早报只传今日相关待办 ──

describe("regression: fix-briefing-stale-todos — 场景 1.1: 早报只展示今日排期", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 北京时间 2026-04-08 08:00
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_only_include_today_scheduled_todos_when_user_has_stale_pending_todos", async () => {
    // 3 个今日排期 + 5 个无排期古早待办
    const pendingTodos = [
      { id: "t1", text: "今日任务1", scheduled_start: new Date("2026-04-07T17:00:00Z"), scheduled_end: null, created_at: "2026-03-20T00:00:00Z", done: false },
      { id: "t2", text: "今日任务2", scheduled_start: new Date("2026-04-07T18:00:00Z"), scheduled_end: null, created_at: "2026-03-20T00:00:00Z", done: false },
      { id: "t3", text: "今日任务3", scheduled_start: "2026-04-08T09:00:00+08:00", scheduled_end: null, created_at: "2026-03-20T00:00:00Z", done: false },
      // 5 个无排期古早待办
      { id: "t4", text: "古早待办1", scheduled_start: null, scheduled_end: null, created_at: "2026-03-15T00:00:00Z", done: false },
      { id: "t5", text: "古早待办2", scheduled_start: null, scheduled_end: null, created_at: "2026-03-16T00:00:00Z", done: false },
      { id: "t6", text: "古早待办3", scheduled_start: null, scheduled_end: null, created_at: "2026-03-17T00:00:00Z", done: false },
      { id: "t7", text: "古早待办4", scheduled_start: null, scheduled_end: null, created_at: "2026-03-18T00:00:00Z", done: false },
      { id: "t8", text: "古早待办5", scheduled_start: null, scheduled_end: null, created_at: "2026-03-19T00:00:00Z", done: false },
    ];
    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue(pendingTodos as any);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: ["今日任务1", "今日任务2", "今日任务3"],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    await generateMorningBriefing("device-1", "user-1");

    // 检查 user message 中只有今日排期，不包含古早待办
    const userMsg = mockedChatCompletion.mock.calls[0][0].find((m: any) => m.role === "user");
    expect(userMsg!.content).toContain("今日任务1");
    expect(userMsg!.content).toContain("今日任务2");
    expect(userMsg!.content).toContain("今日任务3");
    expect(userMsg!.content).not.toContain("古早待办1");
    expect(userMsg!.content).not.toContain("古早待办2");
    // user message 应使用"今日待办"而非"待办"全量计数
    expect(userMsg!.content).toContain("今日待办(3)");
    expect(userMsg!.content).not.toMatch(/待办\(8\)/);
  });
});

describe("regression: fix-briefing-stale-todos — 场景 1.2: carry_over 展示逾期待办", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_include_overdue_todos_in_carry_over_when_scheduled_end_before_today", async () => {
    const pendingTodos = [
      // 逾期：scheduled_end 日期 < today
      { id: "t1", text: "逾期任务1", scheduled_start: "2026-04-05T09:00:00+08:00", scheduled_end: new Date("2026-04-06T16:00:00Z"), created_at: "2026-04-05T00:00:00Z", done: false },
      { id: "t2", text: "逾期任务2", scheduled_start: null, scheduled_end: "2026-04-06T23:59:00+08:00", created_at: "2026-04-05T00:00:00Z", done: false },
      // 正常今日排期
      { id: "t3", text: "今日任务", scheduled_start: new Date("2026-04-07T17:00:00Z"), scheduled_end: null, created_at: "2026-04-08T00:00:00Z", done: false },
    ];
    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue(pendingTodos as any);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: ["今日任务"],
        carry_over: ["逾期任务1", "逾期任务2"],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    await generateMorningBriefing("device-1", "user-1");

    const userMsg = mockedChatCompletion.mock.calls[0][0].find((m: any) => m.role === "user");
    // 逾期任务应出现在消息中
    expect(userMsg!.content).toContain("逾期任务1");
    expect(userMsg!.content).toContain("逾期任务2");
    // 逾期数量正确
    expect(userMsg!.content).toContain("逾期(2)");
  });
});

describe("regression: fix-briefing-stale-todos — 场景 1.3: 过去排期未完成归入 carry_over", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_include_past_scheduled_start_todo_in_carry_over_when_not_completed", async () => {
    const pendingTodos = [
      // scheduled_start = 3天前，无 scheduled_end，未完成 → carry_over
      { id: "t1", text: "过期排期任务", scheduled_start: "2026-04-05T09:00:00+08:00", scheduled_end: null, created_at: "2026-04-05T00:00:00Z", done: false },
      // 今日排期
      { id: "t2", text: "今日任务", scheduled_start: new Date("2026-04-07T17:00:00Z"), scheduled_end: null, created_at: "2026-04-08T00:00:00Z", done: false },
    ];
    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue(pendingTodos as any);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: ["今日任务"],
        carry_over: ["过期排期任务"],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    await generateMorningBriefing("device-1", "user-1");

    const userMsg = mockedChatCompletion.mock.calls[0][0].find((m: any) => m.role === "user");
    // 过期排期任务应在逾期列表中
    expect(userMsg!.content).toContain("过期排期任务");
    // 不应在今日待办列表中（今日待办只有1个）
    expect(userMsg!.content).toContain("今日待办(1)");
  });
});

describe("regression: fix-briefing-stale-todos — 场景 1.4: 无排期无逾期时空列表", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_show_empty_todo_list_when_user_only_has_unscheduled_pending_todos", async () => {
    const pendingTodos = [
      { id: "t1", text: "无排期1", scheduled_start: null, scheduled_end: null, created_at: "2026-03-15T00:00:00Z", done: false },
      { id: "t2", text: "无排期2", scheduled_start: null, scheduled_end: null, created_at: "2026-03-16T00:00:00Z", done: false },
    ];
    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue(pendingTodos as any);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    await generateMorningBriefing("device-1", "user-1");

    const userMsg = mockedChatCompletion.mock.calls[0][0].find((m: any) => m.role === "user");
    // 今日待办数量为 0
    expect(userMsg!.content).toContain("今日待办(0)");
    // 不应包含无排期待办
    expect(userMsg!.content).not.toContain("无排期1");
    expect(userMsg!.content).not.toContain("无排期2");
    // 应提示"今天没有排期的待办"
    expect(userMsg!.content).toContain("今天没有排期的待办");
  });
});

describe("regression: fix-briefing-stale-todos — 边界: 排期+逾期超过10条截断", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_truncate_to_10_when_today_scheduled_plus_overdue_exceeds_10", async () => {
    const pendingTodos = [
      // 7 个今日排期
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `ts${i}`, text: `今日${i}`, scheduled_start: "2026-04-08T09:00:00+08:00", scheduled_end: null, created_at: "2026-04-08T00:00:00Z", done: false,
      })),
      // 5 个逾期
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `ov${i}`, text: `逾期${i}`, scheduled_start: "2026-04-05T09:00:00+08:00", scheduled_end: "2026-04-06T23:59:00+08:00", created_at: "2026-04-05T00:00:00Z", done: false,
      })),
    ];
    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue(pendingTodos as any);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    await generateMorningBriefing("device-1", "user-1");

    const userMsg = mockedChatCompletion.mock.calls[0][0].find((m: any) => m.role === "user");
    // 今日排期全部 7 个应该在（7 < 10）
    expect(userMsg!.content).toContain("今日待办(7)");
    const todayTodoLines = (userMsg!.content as string).split("\n").filter((l: string) => /^- 今日\d/.test(l));
    expect(todayTodoLines.length).toBe(7);
    // 逾期有 5 个但总共截断到 10，剩余 10-7=3 个 slot 给逾期
    expect(userMsg!.content).toContain("逾期(3)");
    // 今日 7 + 逾期 3 = 10，不超过上限
    const overdueMatch = (userMsg!.content as string).match(/逾期\((\d+)\)/);
    const totalShown = todayTodoLines.length + Number(overdueMatch?.[1] ?? 0);
    expect(totalShown).toBeLessThanOrEqual(10);
  });
});

describe("regression: fix-briefing-stale-todos — 边界: 多日任务跨越今天不算逾期", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_not_mark_multi_day_task_as_overdue_when_end_date_is_today_or_later", async () => {
    const pendingTodos = [
      // 多日任务：start=昨天, end=明天 → 仍在进行中，不算逾期
      { id: "t1", text: "跨天任务", scheduled_start: "2026-04-07T09:00:00+08:00", scheduled_end: "2026-04-09T18:00:00+08:00", created_at: "2026-04-07T00:00:00Z", done: false },
      // 多日任务：start=昨天, end=今天 → scheduled_end === today，仍在进行中
      { id: "t2", text: "今天截止", scheduled_start: "2026-04-07T09:00:00+08:00", scheduled_end: "2026-04-08T18:00:00+08:00", created_at: "2026-04-07T00:00:00Z", done: false },
      // 真正逾期：start=前天, end=昨天
      { id: "t3", text: "真逾期", scheduled_start: "2026-04-06T09:00:00+08:00", scheduled_end: "2026-04-07T18:00:00+08:00", created_at: "2026-04-06T00:00:00Z", done: false },
    ];
    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue(pendingTodos as any);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        greeting: "早上好",
        today_focus: [],
        carry_over: ["真逾期"],
        goal_pulse: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    await generateMorningBriefing("device-1", "user-1");

    const userMsg = mockedChatCompletion.mock.calls[0][0].find((m: any) => m.role === "user");
    // 跨天任务和今天截止的不应在逾期列表中
    expect(userMsg!.content).not.toContain("跨天任务");
    expect(userMsg!.content).not.toContain("今天截止");
    // 真逾期应在
    expect(userMsg!.content).toContain("真逾期");
    expect(userMsg!.content).toContain("逾期(1)");
  });
});

// ── regression: fix-briefing-stale-todos — 晚报日记条目摘要 ──

describe("regression: fix-briefing-stale-todos — 场景 2.1: 晚报含日记条目摘要", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_include_diary_entry_summaries_with_time_in_user_message", async () => {
    // 准备今日完成的待办
    vi.mocked(todoRepo.findCompletedByUserInRange).mockResolvedValue([
      { id: "d1", text: "完成任务A", done: true, completed_at: new Date("2026-04-08T02:00:00Z"), created_at: "2026-04-08T00:00:00Z" },
      { id: "d2", text: "完成任务B", done: true, completed_at: new Date("2026-04-08T05:00:00Z"), created_at: "2026-04-08T00:00:00Z" },
      { id: "d3", text: "完成任务C", done: true, completed_at: new Date("2026-04-08T08:00:00Z"), created_at: "2026-04-08T00:00:00Z" },
    ] as any);

    // 准备今日记录 + 日记
    vi.mocked(recordRepo.findByUser).mockResolvedValue([
      { id: "r1", created_at: new Date("2026-04-08T02:00:00Z") },
      { id: "r2", created_at: new Date("2026-04-08T06:00:00Z") },
    ] as any);
    vi.mocked(recordRepo.findByUserAndDateRange).mockResolvedValue([
      { id: "r1", device_id: "d", user_id: "u", created_at: "2026-04-08T02:00:00Z", source: "speech", archived: false },
      { id: "r2", device_id: "d", user_id: "u", created_at: "2026-04-08T06:00:00Z", source: "speech", archived: false },
    ] as any);
    vi.mocked(transcriptRepo.findByRecordIds).mockResolvedValue([
      { id: "t1", record_id: "r1", text: "上午开了产品会议讨论了新功能方向", language: "zh", created_at: "2026-04-08T02:00:00Z" },
      { id: "t2", record_id: "r2", text: "下午写了两小时代码重构了登录模块", language: "zh", created_at: "2026-04-08T06:00:00Z" },
    ]);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "充实的一天",
        accomplishments: ["完成任务A", "完成任务B", "完成任务C"],
        insight: "今天在产品思考和技术实现之间切换",
        affirmation: "保持这种节奏",
        tomorrow_preview: [],
        stats: { done: 3, new_records: 2 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateEveningSummary("device-1", "user-1");

    const userMsg = mockedChatCompletion.mock.calls[0][0].find((m: any) => m.role === "user");
    // 应包含日记条目的时间标记（HH:mm 格式，北京时间）
    // r1: 2026-04-08T02:00:00Z = 北京 10:00
    // r2: 2026-04-08T06:00:00Z = 北京 14:00
    expect(userMsg!.content).toContain("10:00");
    expect(userMsg!.content).toContain("14:00");
    // 应包含日记文本摘要
    expect(userMsg!.content).toContain("上午开了产品会议");
    expect(userMsg!.content).toContain("下午写了两小时代码");

    // 结果验证
    expect(result!.stats.done).toBe(3);
    expect(result!.stats.new_records).toBe(2);
    expect(result!.insight).toBeTruthy();
  });
});

describe("regression: fix-briefing-stale-todos — 场景 2.2: 晚报只完成待办没写日记", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_return_empty_insight_when_no_diary_entries", async () => {
    vi.mocked(todoRepo.findCompletedByUserInRange).mockResolvedValue([
      { id: "d1", text: "完成任务A", done: true, completed_at: new Date("2026-04-08T02:00:00Z"), created_at: "2026-04-08T00:00:00Z" },
      { id: "d2", text: "完成任务B", done: true, completed_at: new Date("2026-04-08T05:00:00Z"), created_at: "2026-04-08T00:00:00Z" },
    ] as any);
    vi.mocked(recordRepo.findByUser).mockResolvedValue([] as any);
    vi.mocked(recordRepo.findByUserAndDateRange).mockResolvedValue([]);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "今天搞定了两件事",
        accomplishments: ["完成任务A", "完成任务B"],
        insight: "",
        affirmation: "不错",
        tomorrow_preview: [],
        stats: { done: 2, new_records: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateEveningSummary("device-1", "user-1");

    expect(result!.accomplishments).toHaveLength(2);
    expect(result!.insight).toBe("");
  });
});

describe("regression: fix-briefing-stale-todos — 场景 2.3: 用户今天什么都没做", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_return_warm_empty_report_when_nothing_done_today", async () => {
    vi.mocked(todoRepo.findCompletedByUserInRange).mockResolvedValue([] as any);
    vi.mocked(recordRepo.findByUser).mockResolvedValue([] as any);
    vi.mocked(recordRepo.findByUserAndDateRange).mockResolvedValue([]);

    mockedChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        headline: "今天就这样了，也挺好的",
        accomplishments: [],
        insight: "",
        affirmation: "休息也是一种选择",
        tomorrow_preview: [],
        stats: { done: 0, new_records: 0 },
      }),
      usage: { input: 100, output: 50 },
    } as any);

    const result = await generateEveningSummary("device-1", "user-1");

    expect(result!.accomplishments).toEqual([]);
    expect(result!.headline).toBeTruthy();
    // headline 不应是公文腔
    expect(result!.headline).not.toContain("无事项完成");
  });
});

describe("regression: fix-briefing-stale-todos — 早报 fallback 也使用过滤逻辑", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_use_filtered_todos_in_fallback_when_ai_fails", async () => {
    const pendingTodos = [
      { id: "t1", text: "今日任务", scheduled_start: "2026-04-08T09:00:00+08:00", scheduled_end: null, created_at: "2026-04-08T00:00:00Z", done: false },
      { id: "t2", text: "古早待办", scheduled_start: null, scheduled_end: null, created_at: "2026-03-15T00:00:00Z", done: false },
    ];
    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue(pendingTodos as any);
    mockedChatCompletion.mockRejectedValue(new Error("AI down"));

    const result = await generateMorningBriefing("device-1", "user-1");

    // fallback 的 today_focus 只应包含今日排期
    expect(result!.today_focus).toContain("今日任务");
    expect(result!.today_focus).not.toContain("古早待办");
  });
});

// ── 边界条件: fallback 行为 ──

describe("边界条件: AI 失败时的 fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_return_fallback_with_goal_pulse_empty_when_ai_fails_for_morning", async () => {
    mockedChatCompletion.mockRejectedValue(new Error("AI down"));

    const result = await generateMorningBriefing("device-1", "user-1");
    expect(result).not.toBeNull();
    expect(result!.goal_pulse).toEqual([]);
  });

  it("should_return_fallback_with_empty_insight_and_affirmation_when_ai_fails_for_evening", async () => {
    mockedChatCompletion.mockRejectedValue(new Error("AI down"));

    const result = await generateEveningSummary("device-1", "user-1");
    expect(result).not.toBeNull();
    expect(result!.insight).toBe("");
    expect(result!.affirmation).toBe("");
  });
});
