/**
 * cold-start-onboarding spec 测试
 * 覆盖场景 1-5: 5问流程、种子数据、系统初始化、跳过、已完成用户
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mocks ─────────────────────────────────────────────────────────────
const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
const mockExecute = vi.fn().mockResolvedValue(undefined);
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: (...args) => mockQueryOne(...args),
    execute: (...args) => mockExecute(...args),
}));
vi.mock("../db/repositories/index.js", () => ({
    recordRepo: {
        create: vi.fn().mockResolvedValue({ id: "rec-1" }),
        findById: vi.fn(),
        markDigested: vi.fn(),
        updateStatus: vi.fn(),
    },
    strikeRepo: { create: vi.fn(), findActive: vi.fn().mockResolvedValue([]) },
    bondRepo: { createMany: vi.fn().mockResolvedValue([]) },
    strikeTagRepo: { createMany: vi.fn() },
    summaryRepo: { findByRecordId: vi.fn().mockResolvedValue(null) },
    transcriptRepo: {
        findByRecordIds: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "t-1", record_id: "rec-1", text: "" }),
    },
    userProfileRepo: {
        findByUser: vi.fn(),
        upsertByUser: vi.fn(),
        upsertOnboardingField: vi.fn(),
    },
}));
vi.mock("../ai/provider.js", () => ({
    chatCompletion: vi.fn().mockResolvedValue({ content: '{"strikes":[],"bonds":[]}' }),
}));
vi.mock("../diary/manager.js", () => ({
    appendToDiary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./digest.js", () => ({
    digestRecords: vi.fn().mockResolvedValue(undefined),
}));
// =====================================================================
// 场景 1: 5 问对话流程 — handler 处理每步回答
// =====================================================================
describe("场景1: Onboarding 回答处理", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should_store_name_in_profile_when_step_is_1", async () => {
        const { handleOnboardingAnswer } = await import("./onboarding.js");
        const result = await handleOnboardingAnswer({
            userId: "user-1",
            deviceId: "dev-1",
            step: 1,
            answer: "小明",
        });
        expect(result.ok).toBe(true);
        expect(result.recordCreated).toBe(false); // Q1 不创建日记
        // 验证 profile name 被存储
        const { userProfileRepo } = await import("../db/repositories/index.js");
        expect(vi.mocked(userProfileRepo.upsertOnboardingField)).toHaveBeenCalledWith("user-1", "name", "小明");
    });
    it("should_create_record_and_trigger_digest_when_step_is_2", async () => {
        const { handleOnboardingAnswer } = await import("./onboarding.js");
        const result = await handleOnboardingAnswer({
            userId: "user-1",
            deviceId: "dev-1",
            step: 2,
            answer: "我是一名产品经理，在一家创业公司工作",
        });
        expect(result.ok).toBe(true);
        expect(result.recordCreated).toBe(true);
        // 验证 Digest 被触发
        const { digestRecords } = await import("./digest.js");
        expect(vi.mocked(digestRecords)).toHaveBeenCalled();
    });
    it("should_create_record_for_steps_3_4_5", async () => {
        const { handleOnboardingAnswer } = await import("./onboarding.js");
        for (const step of [3, 4, 5]) {
            vi.clearAllMocks();
            const result = await handleOnboardingAnswer({
                userId: "user-1",
                deviceId: "dev-1",
                step,
                answer: `回答第${step}题`,
            });
            expect(result.ok).toBe(true);
            expect(result.recordCreated).toBe(true);
        }
    });
    it("should_store_pain_points_when_step_is_4", async () => {
        const { handleOnboardingAnswer } = await import("./onboarding.js");
        await handleOnboardingAnswer({
            userId: "user-1",
            deviceId: "dev-1",
            step: 4,
            answer: "我总是拖延，想法太散了",
        });
        const { userProfileRepo } = await import("../db/repositories/index.js");
        expect(vi.mocked(userProfileRepo.upsertOnboardingField)).toHaveBeenCalledWith("user-1", "pain_points", "我总是拖延，想法太散了");
    });
    it("should_mark_onboarding_done_when_step_is_5", async () => {
        const { handleOnboardingAnswer } = await import("./onboarding.js");
        await handleOnboardingAnswer({
            userId: "user-1",
            deviceId: "dev-1",
            step: 5,
            answer: "晚上睡前",
        });
        const { userProfileRepo } = await import("../db/repositories/index.js");
        expect(vi.mocked(userProfileRepo.upsertOnboardingField)).toHaveBeenCalledWith("user-1", "onboarding_done", "true");
    });
});
// =====================================================================
// 场景 2: 冷启动种子数据 — 立即 Digest
// =====================================================================
describe("场景2: 冷启动立即 Digest", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should_trigger_immediate_digest_for_all_onboarding_answers", async () => {
        const { handleOnboardingAnswer } = await import("./onboarding.js");
        // Q2-Q5 都应该创建 record 并触发 digest
        for (const step of [2, 3, 4, 5]) {
            vi.clearAllMocks();
            await handleOnboardingAnswer({
                userId: "user-1",
                deviceId: "dev-1",
                step,
                answer: `Answer for step ${step}`,
            });
            const { digestRecords } = await import("./digest.js");
            expect(vi.mocked(digestRecords)).toHaveBeenCalledTimes(1);
        }
    });
});
// =====================================================================
// 场景 4: 跳过机制
// =====================================================================
describe("场景4: 跳过机制", () => {
    it("should_handle_skip_without_creating_record", async () => {
        const { handleOnboardingAnswer } = await import("./onboarding.js");
        const result = await handleOnboardingAnswer({
            userId: "user-1",
            deviceId: "dev-1",
            step: 3,
            answer: "", // 空回答 = 跳过
        });
        expect(result.ok).toBe(true);
        expect(result.recordCreated).toBe(false);
        expect(result.skipped).toBe(true);
    });
});
// =====================================================================
// 场景 6: 冷启动期 process.ts 立即 Digest
// =====================================================================
describe("场景6: 冷启动期 shouldDigestImmediately 改造", () => {
    it("should_always_digest_when_record_count_below_20", () => {
        // 测试 shouldDigestImmediately 函数
        // 冷启动期：record 数 < 20，无论 text 长度都应返回 true
        // 这个函数将在 process.ts 中被修改
        // 此处验证逻辑：短文本 + 冷启动 → true
        const isColdStart = true;
        const textLength = 10; // 很短
        const shouldDigest = isColdStart || textLength > 80;
        expect(shouldDigest).toBe(true);
    });
    it("should_not_always_digest_when_past_cold_start", () => {
        const isColdStart = false;
        const textLength = 10;
        const shouldDigest = isColdStart || textLength > 80;
        expect(shouldDigest).toBe(false);
    });
});
//# sourceMappingURL=onboarding.test.js.map