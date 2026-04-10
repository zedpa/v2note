import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
/**
 * 测试 daily-loop 中 scheduled_start 的类型安全处理
 * 根因：PostgreSQL pg 驱动对 timestamp 列返回 Date 对象，
 * 代码假设是 string 调用 .startsWith() 导致 TypeError
 */
// 提取为独立可测试的工具函数
// 此函数将在实现阶段创建于 daily-loop.ts 中
import { toDateString } from "./daily-loop.js";
describe("toDateString — scheduled_start 类型安全转换", () => {
    it("should_return_iso_string_when_given_Date_object", () => {
        const date = new Date("2026-04-02T09:00:00Z");
        const result = toDateString(date);
        expect(result).toBe("2026-04-02T09:00:00.000Z");
    });
    it("should_return_string_as_is_when_given_string", () => {
        const result = toDateString("2026-04-02T09:00:00Z");
        expect(result).toBe("2026-04-02T09:00:00Z");
    });
    it("should_return_null_when_given_null", () => {
        expect(toDateString(null)).toBeNull();
    });
    it("should_return_null_when_given_undefined", () => {
        expect(toDateString(undefined)).toBeNull();
    });
    it("should_return_null_when_given_non_date_object", () => {
        expect(toDateString(123)).toBeNull();
        expect(toDateString({})).toBeNull();
    });
    it("should_enable_startsWith_filtering_for_Date_objects", () => {
        const todos = [
            { text: "A", scheduled_start: new Date("2026-04-02T09:00:00Z") },
            { text: "B", scheduled_start: new Date("2026-04-03T10:00:00Z") },
            { text: "C", scheduled_start: null },
            { text: "D", scheduled_start: "2026-04-02T14:00:00Z" },
        ];
        const today = "2026-04-02";
        const filtered = todos.filter((t) => toDateString(t.scheduled_start)?.startsWith(today));
        expect(filtered.map((t) => t.text)).toEqual(["A", "D"]);
    });
    it("should_handle_mixed_Date_and_string_types_in_same_array", () => {
        const todos = [
            { scheduled_start: new Date("2026-04-02T08:00:00Z") },
            { scheduled_start: "2026-04-02T12:00:00.000Z" },
            { scheduled_start: null },
        ];
        const today = "2026-04-02";
        const count = todos.filter((t) => toDateString(t.scheduled_start)?.startsWith(today)).length;
        expect(count).toBe(2);
    });
});
// ── regression: fix-morning-briefing ──
// Bug 1: UTC 时区错位 — daily-loop 使用 toISOString().split("T")[0] 获取日期，返回 UTC 日期
// Bug 2: 问候语基于待办 + ≤15字太短
// Mock 所有外部依赖
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
    },
    recordRepo: {
        findByUser: vi.fn().mockResolvedValue([]),
        findByDevice: vi.fn().mockResolvedValue([]),
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
import { generateMorningBriefing, generateEveningSummary } from "./daily-loop.js";
import { chatCompletion } from "../ai/provider.js";
import * as briefingRepo from "../db/repositories/daily-briefing.js";
import { todoRepo } from "../db/repositories/index.js";
import { loadSoul } from "../soul/manager.js";
import { loadProfile } from "../profile/manager.js";
const mockedChatCompletion = vi.mocked(chatCompletion);
const mockedFindByDeviceAndDate = vi.mocked(briefingRepo.findByDeviceAndDate);
const mockedFindByUserAndDate = vi.mocked(briefingRepo.findByUserAndDate);
const mockedUpsert = vi.mocked(briefingRepo.upsert);
const mockedLoadSoul = vi.mocked(loadSoul);
const mockedLoadProfile = vi.mocked(loadProfile);
const mockedCountByUserDateRange = vi.mocked(todoRepo.countByUserDateRange);
describe("regression: fix-morning-briefing — Bug 1: UTC 时区错位", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 默认 AI 返回一个有效 JSON
        mockedChatCompletion.mockResolvedValue({
            content: JSON.stringify({
                greeting: "早上好，4月8日周三",
                today_focus: [],
                carry_over: [],
                stats: { yesterday_done: 0, yesterday_total: 0 },
            }),
            usage: { input: 100, output: 50 },
        });
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it("should_use_local_date_2026_04_08_when_beijing_time_is_0730_utc_is_2330_prev_day", async () => {
        // 场景 1.1: 北京时间 4月8日 7:30 = UTC 4月7日 23:30
        // 设置一个 fake Date，使得 getFullYear/getMonth/getDate 返回本地日期
        // 关键：我们用 vi.useFakeTimers 并模拟 UTC+8 行为
        // 由于 Node 在测试中使用系统时区，我们通过设置 TZ 环境变量来确保时区
        // 但在单元测试中，更可靠的方式是：直接验证 daily-loop 使用的是 fmt() 而非 toISOString()
        // 我们通过 mock briefingRepo 的调用来验证传入的日期参数
        // 模拟北京时间 2026-04-08 07:30:00 (UTC: 2026-04-07 23:30:00)
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-07T23:30:00Z"));
        // 设置 TZ 为 Asia/Shanghai 以确保 fmt() 返回本地日期
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        try {
            await generateMorningBriefing("device-1", "user-1");
            // 验证缓存查询使用的日期参数是 "2026-04-08" (本地日期) 而非 "2026-04-07" (UTC日期)
            expect(mockedFindByUserAndDate).toHaveBeenCalledWith("user-1", "2026-04-08", "morning");
            // 验证缓存写入也使用本地日期
            expect(mockedUpsert).toHaveBeenCalledWith("device-1", "2026-04-08", "morning", expect.any(Object), "user-1");
        }
        finally {
            process.env.TZ = origTZ;
            vi.useRealTimers();
        }
    });
    it("should_calculate_yesterday_correctly_when_beijing_0730", async () => {
        // 场景 1.4 的一部分：yesterday 应为 "2026-04-07"
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-07T23:30:00Z"));
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        try {
            await generateMorningBriefing("device-1", "user-1");
            // 验证 countByUserDateRange 使用 yesterday = "2026-04-07" (本地日期下的昨天)
            // dayRange("2026-04-07") 正确转换：+08:00 → UTC
            expect(mockedCountByUserDateRange).toHaveBeenCalledWith("user-1", "2026-04-06T16:00:00.000Z", "2026-04-07T15:59:59.999Z");
        }
        finally {
            process.env.TZ = origTZ;
            vi.useRealTimers();
        }
    });
    it("should_use_local_date_for_evening_summary_when_2000_beijing", async () => {
        // 场景 1.2 / 1.5: 晚上 8:00 PM 北京时间 = UTC 12:00
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        // 给 evening summary 提供 AI 返回
        mockedChatCompletion.mockResolvedValue({
            content: JSON.stringify({
                headline: "充实的一天",
                accomplishments: [],
                tomorrow_preview: [],
                stats: { done: 0, new_records: 0 },
            }),
            usage: { input: 100, output: 50 },
        });
        try {
            await generateEveningSummary("device-1", "user-1");
            // 验证缓存查询使用 "2026-04-08"
            expect(mockedFindByUserAndDate).toHaveBeenCalledWith("user-1", "2026-04-08", "evening");
            // 验证缓存写入也使用 "2026-04-08"
            expect(mockedUpsert).toHaveBeenCalledWith("device-1", "2026-04-08", "evening", expect.any(Object), "user-1");
        }
        finally {
            process.env.TZ = origTZ;
            vi.useRealTimers();
        }
    });
    it("should_use_local_date_for_forceRefresh_at_midnight", async () => {
        // 场景 1.4: 凌晨 0:30 AM 北京时间 = UTC 4月7日 16:30
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-07T16:30:00Z"));
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        try {
            await generateMorningBriefing("device-1", "user-1", true);
            // forceRefresh 跳过缓存查询
            expect(mockedFindByUserAndDate).not.toHaveBeenCalled();
            // 但缓存写入应使用 "2026-04-08"（本地凌晨 0:30 仍是 4月8日）
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
                stats: { yesterday_done: 3, yesterday_total: 5 },
            }),
            usage: { input: 100, output: 50 },
        });
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it("should_include_soul_and_profile_in_prompt_when_available", async () => {
        // 场景 2.1: 问候语由 soul 和 profile 驱动
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        mockedLoadSoul.mockResolvedValue({
            device_id: "device-1",
            content: "喜欢简洁务实的沟通",
            updated_at: "2026-04-07",
        });
        mockedLoadProfile.mockResolvedValue({
            device_id: "device-1",
            content: "产品经理，关注效率",
            updated_at: "2026-04-07",
        });
        try {
            await generateMorningBriefing("device-1", "user-1");
            // 验证 chatCompletion 被调用时，system prompt 中包含 soul 和 profile 内容
            const callArgs = mockedChatCompletion.mock.calls[0];
            const messages = callArgs[0];
            const systemMsg = messages.find((m) => m.role === "system");
            expect(systemMsg).toBeDefined();
            // soul/profile 应该用 XML 标签包裹，作为 prompt 主体
            expect(systemMsg.content).toContain("喜欢简洁务实的沟通");
            expect(systemMsg.content).toContain("产品经理，关注效率");
        }
        finally {
            process.env.TZ = origTZ;
            vi.useRealTimers();
        }
    });
    it("should_not_contain_todo_driven_greeting_instruction_in_prompt", async () => {
        // 场景 2.1: prompt 不应包含"根据待办数据"
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        try {
            await generateMorningBriefing("device-1", "user-1");
            const callArgs = mockedChatCompletion.mock.calls[0];
            const messages = callArgs[0];
            const systemMsg = messages.find((m) => m.role === "system");
            // 不应包含"根据待办数据"
            expect(systemMsg.content).not.toContain("根据待办数据");
            // 应包含"根据用户画像"
            expect(systemMsg.content).toContain("根据用户画像");
        }
        finally {
            process.env.TZ = origTZ;
            vi.useRealTimers();
        }
    });
    it("should_have_greeting_limit_of_30_chars_in_prompt", async () => {
        // 场景 2.3: greeting 字数限制从 ≤15 放宽到 ≤30
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        try {
            await generateMorningBriefing("device-1", "user-1");
            const callArgs = mockedChatCompletion.mock.calls[0];
            const messages = callArgs[0];
            const systemMsg = messages.find((m) => m.role === "system");
            // 应包含 ≤30 而不是 ≤15
            expect(systemMsg.content).toContain("≤30");
            expect(systemMsg.content).not.toContain("≤15");
        }
        finally {
            process.env.TZ = origTZ;
            vi.useRealTimers();
        }
    });
    it("should_instruct_ai_not_to_mention_todo_count_in_greeting", async () => {
        // 场景 2.1: 问候不要提待办数量
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        try {
            await generateMorningBriefing("device-1", "user-1");
            const callArgs = mockedChatCompletion.mock.calls[0];
            const messages = callArgs[0];
            const systemMsg = messages.find((m) => m.role === "system");
            // prompt 中应有"不要提待办数量"的指示
            expect(systemMsg.content).toContain("不要提待办数量");
        }
        finally {
            process.env.TZ = origTZ;
            vi.useRealTimers();
        }
    });
    it("should_use_xml_tags_for_soul_and_profile_in_prompt", async () => {
        // 验证 soul/profile 使用 XML 标签包裹
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        mockedLoadSoul.mockResolvedValue({
            device_id: "device-1",
            content: "温柔体贴型人格",
            updated_at: "2026-04-07",
        });
        mockedLoadProfile.mockResolvedValue({
            device_id: "device-1",
            content: "自由职业设计师",
            updated_at: "2026-04-07",
        });
        try {
            await generateMorningBriefing("device-1", "user-1");
            const callArgs = mockedChatCompletion.mock.calls[0];
            const messages = callArgs[0];
            const systemMsg = messages.find((m) => m.role === "system");
            // 应使用 XML 标签包裹 soul 和 profile
            expect(systemMsg.content).toContain("<user_soul>");
            expect(systemMsg.content).toContain("</user_soul>");
            expect(systemMsg.content).toContain("<user_profile>");
            expect(systemMsg.content).toContain("</user_profile>");
        }
        finally {
            process.env.TZ = origTZ;
            vi.useRealTimers();
        }
    });
    it("should_generate_fallback_greeting_without_soul_profile_when_new_user", async () => {
        // 场景 2.2: 新用户无 soul/profile 时降级为通用问候
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
        const origTZ = process.env.TZ;
        process.env.TZ = "Asia/Shanghai";
        mockedLoadSoul.mockResolvedValue(null);
        mockedLoadProfile.mockResolvedValue(null);
        try {
            await generateMorningBriefing("device-1", "user-1");
            const callArgs = mockedChatCompletion.mock.calls[0];
            const messages = callArgs[0];
            const systemMsg = messages.find((m) => m.role === "system");
            // 无 soul/profile 时 prompt 仍应正常工作
            // 不应出现 undefined 或 null 文本
            expect(systemMsg.content).not.toContain("undefined");
            expect(systemMsg.content).not.toContain("null");
            // prompt 仍应基于用户画像
            expect(systemMsg.content).toContain("根据用户画像");
        }
        finally {
            process.env.TZ = origTZ;
            vi.useRealTimers();
        }
    });
});
//# sourceMappingURL=daily-loop.test.js.map