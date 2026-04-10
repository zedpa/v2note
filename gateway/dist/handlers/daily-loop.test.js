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
            { text: "A", scheduled_start: new Date("2026-04-02T09:00:00Z") }, // Beijing: 04-02
            { text: "B", scheduled_start: new Date("2026-04-03T10:00:00Z") }, // Beijing: 04-03
            { text: "C", scheduled_start: null },
            { text: "D", scheduled_start: "2026-04-02T14:00:00Z" }, // Beijing: 04-02
        ];
        const today = "2026-04-02";
        const filtered = todos.filter((t) => toLocalDateStr(t.scheduled_start) === today);
        expect(filtered.map((t) => t.text)).toEqual(["A", "D"]);
    });
    it("should_correctly_handle_UTC_midnight_crossover", () => {
        const todos = [
            { scheduled_start: new Date("2026-04-01T16:00:00Z") }, // Beijing: 04-02 00:00
            { scheduled_start: new Date("2026-04-01T15:59:59Z") }, // Beijing: 04-01 23:59
            { scheduled_start: "2026-04-02T00:00:00+08:00" }, // Beijing: 04-02
        ];
        const today = "2026-04-02";
        const count = todos.filter((t) => toLocalDateStr(t.scheduled_start) === today).length;
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
        });
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it("should_call_loadWarmContext_with_briefing_mode_when_generating_morning_briefing", async () => {
        await generateMorningBriefing("device-1", "user-1");
        expect(mockedLoadWarmContext).toHaveBeenCalledWith(expect.objectContaining({
            deviceId: "device-1",
            userId: "user-1",
            mode: "briefing",
        }));
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
        expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
            agent: "briefing",
            soul: "温柔的灵魂",
            userAgent: "晨间简报: 开启",
            userProfile: "产品经理",
            memory: ["记忆1"],
        }));
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
        expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
            soul: longSoul,
        }));
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
        expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
            memory: ["记忆A", "记忆B", "记忆C"],
            wikiContext: ["知识X", "知识Y"],
        }));
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
            { id: "g1", title: "学习 Rust", device_id: "d", user_id: "u", parent_id: null, status: "active", source: "manual", cluster_id: null, wiki_page_id: null, created_at: "", updated_at: "" },
            { id: "g2", title: "健身计划", device_id: "d", user_id: "u", parent_id: null, status: "progressing", source: "manual", cluster_id: null, wiki_page_id: null, created_at: "", updated_at: "" },
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
        });
        const result = await generateMorningBriefing("device-1", "user-1");
        // 用户消息应包含目标脉搏段落
        const callArgs = mockedChatCompletion.mock.calls[0];
        const messages = callArgs[0];
        const userMsg = messages.find((m) => m.role === "user");
        expect(userMsg.content).toContain("目标脉搏");
        expect(userMsg.content).toContain("学习 Rust");
        expect(userMsg.content).toContain("1/3");
        // 返回结果包含 goal_pulse
        expect(result.goal_pulse).toBeDefined();
        expect(result.goal_pulse).toHaveLength(2);
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
        });
        const result = await generateMorningBriefing("device-1", "user-1");
        // 默认值补充
        expect(result.goal_pulse).toEqual([]);
    });
    it("should_limit_goals_to_5_when_user_has_many_active_goals", async () => {
        const goals = Array.from({ length: 8 }, (_, i) => ({
            id: `g${i}`, title: `目标${i}`, device_id: "d", user_id: "u",
            parent_id: null, status: "active", source: "manual",
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
        });
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
        });
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
        });
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
        });
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
        });
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it("should_call_loadWarmContext_with_briefing_mode_when_generating_evening_summary", async () => {
        await generateEveningSummary("device-1", "user-1");
        expect(mockedLoadWarmContext).toHaveBeenCalledWith(expect.objectContaining({
            deviceId: "device-1",
            userId: "user-1",
            mode: "briefing",
        }));
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
        expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
            agent: "briefing",
            soul: "温暖灵魂",
            userAgent: "规则内容",
            userProfile: "设计师",
            memory: ["记忆1", "记忆2"],
            wikiContext: ["wiki知识"],
        }));
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
        ]);
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
        });
        const result = await generateEveningSummary("device-1", "user-1");
        // 用户消息中包含日记内容
        const callArgs = mockedChatCompletion.mock.calls[0];
        const messages = callArgs[0];
        const userMsg = messages.find((m) => m.role === "user");
        expect(userMsg.content).toContain("日记");
        expect(userMsg.content).toContain("今天上午开了个会议");
        // 结果包含 insight
        expect(result.insight).toBe("你今天在产品思考和技术实现之间切换，效率很高");
    });
    it("should_truncate_diary_text_to_2000_chars_at_record_boundary", async () => {
        // 构造超长日记
        const longText1 = "A".repeat(1500);
        const longText2 = "B".repeat(800); // 总计 2300 > 2000
        vi.mocked(recordRepo.findByUserAndDateRange).mockResolvedValue([
            { id: "r1", device_id: "d", user_id: "u", created_at: "2026-04-08T10:00:00Z", source: "speech", archived: false },
            { id: "r2", device_id: "d", user_id: "u", created_at: "2026-04-08T14:00:00Z", source: "speech", archived: false },
        ]);
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
        });
        await generateEveningSummary("device-1", "user-1");
        // 用户消息中应包含第一条记录但不包含第二条（超出 2000 字）
        const userMsg = mockedChatCompletion.mock.calls[0][0].find((m) => m.role === "user");
        expect(userMsg.content).toContain(longText1);
        expect(userMsg.content).not.toContain(longText2);
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
        });
        const result = await generateEveningSummary("device-1", "user-1");
        // 默认值
        expect(result.insight).toBe("");
        expect(result.affirmation).toBe("");
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
        });
        const result = await generateEveningSummary("device-1", "user-1");
        expect(result.insight).toBe("你今天花了很多时间在深度工作上");
        expect(result.affirmation).toBe("每一步小的进步都在积累");
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
        });
        const result = await generateEveningSummary("device-1", "user-1");
        expect(result.insight).toBe("");
        expect(result.affirmation).toBe("");
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
        });
        const result = await generateMorningBriefing("device-1", "user-1");
        expect(result.goal_pulse).toEqual([]);
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
        });
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
            expect(mockedUpsert).toHaveBeenCalledWith("device-1", "2026-04-08", "morning", expect.any(Object), "user-1");
        }
        finally {
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
            expect(mockedCountByUserDateRange).toHaveBeenCalledWith("user-1", "2026-04-06T16:00:00.000Z", "2026-04-07T15:59:59.999Z");
        }
        finally {
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
        });
        try {
            await generateEveningSummary("device-1", "user-1");
            expect(mockedFindByUserAndDate).toHaveBeenCalledWith("user-1", "2026-04-08", "evening");
            expect(mockedUpsert).toHaveBeenCalledWith("device-1", "2026-04-08", "evening", expect.any(Object), "user-1");
        }
        finally {
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
            expect(mockedUpsert).toHaveBeenCalledWith("device-1", "2026-04-08", "morning", expect.any(Object), "user-1");
        }
        finally {
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
        });
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
            expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
                soul: "喜欢简洁务实的沟通",
                userProfile: "产品经理，关注效率",
            }));
            // system prompt 来自 buildSystemPrompt 的返回值
            const callArgs = mockedChatCompletion.mock.calls[0];
            const messages = callArgs[0];
            const systemMsg = messages.find((m) => m.role === "system");
            // 应包含 buildSystemPrompt 返回值 + briefing 特定指令
            expect(systemMsg).toBeDefined();
        }
        finally {
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
        });
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it("should_pass_agent_briefing_to_buildSystemPrompt", async () => {
        await generateMorningBriefing("device-1", "user-1");
        expect(mockedBuildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
            agent: "briefing",
        }));
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
        expect(result.goal_pulse).toEqual([]);
    });
    it("should_return_fallback_with_empty_insight_and_affirmation_when_ai_fails_for_evening", async () => {
        mockedChatCompletion.mockRejectedValue(new Error("AI down"));
        const result = await generateEveningSummary("device-1", "user-1");
        expect(result).not.toBeNull();
        expect(result.insight).toBe("");
        expect(result.affirmation).toBe("");
    });
});
//# sourceMappingURL=daily-loop.test.js.map