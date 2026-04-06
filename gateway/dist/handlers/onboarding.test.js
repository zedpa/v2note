/**
 * Onboarding v3 测试 — 两步引导
 * Step 1: 存名字
 * Step 2: 调用 process pipeline，返回 AI 拆解结果
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mocks ─────────────────────────────────────────────────────────────
const mockUpsertOnboardingField = vi.fn().mockResolvedValue(undefined);
const mockRecordCreate = vi.fn().mockResolvedValue({ id: "rec-1" });
const mockTranscriptCreate = vi.fn().mockResolvedValue({ id: "t-1" });
vi.mock("../db/repositories/index.js", () => ({
    userProfileRepo: {
        upsertOnboardingField: (...args) => mockUpsertOnboardingField(...args),
    },
    recordRepo: {
        create: (...args) => mockRecordCreate(...args),
    },
    transcriptRepo: {
        create: (...args) => mockTranscriptCreate(...args),
    },
}));
const mockProcessEntry = vi.fn().mockResolvedValue({
    summary: "想法摘要",
    todos: ["写报告"],
    tags: ["工作"],
});
vi.mock("./process.js", () => ({
    processEntry: (...args) => mockProcessEntry(...args),
}));
// =====================================================================
describe("Onboarding v3: 两步引导", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    // ── Step 1 ──
    it("should_save_name_when_step_1", async () => {
        const { handleOnboardingChat } = await import("./onboarding.js");
        const result = await handleOnboardingChat({
            userId: "user-1",
            deviceId: "dev-1",
            step: 1,
            answer: "小明",
        });
        expect(result.step).toBe(1);
        expect(result.done).toBe(false);
        if (result.step === 1) {
            expect(result.name).toBe("小明");
        }
        expect(mockUpsertOnboardingField).toHaveBeenCalledWith("user-1", "name", "小明", "dev-1");
    });
    it("should_use_default_name_when_step_1_empty", async () => {
        const { handleOnboardingChat } = await import("./onboarding.js");
        const result = await handleOnboardingChat({
            userId: "user-1",
            deviceId: "dev-1",
            step: 1,
            answer: "",
        });
        expect(result.step).toBe(1);
        expect(result.done).toBe(false);
        if (result.step === 1) {
            expect(result.name).toBe("用户");
        }
    });
    // ── Step 2 ──
    it("should_process_thought_and_return_result_when_step_2", async () => {
        const { handleOnboardingChat } = await import("./onboarding.js");
        const result = await handleOnboardingChat({
            userId: "user-1",
            deviceId: "dev-1",
            step: 2,
            answer: "明天要交报告，还没开始写",
        });
        expect(result.step).toBe(2);
        expect(result.done).toBe(true);
        if (result.step === 2) {
            expect(result.summary).toBe("想法摘要");
            expect(result.todos).toEqual(["写报告"]);
            expect(result.tags).toEqual(["工作"]);
            expect(result.recordId).toBe("rec-1");
        }
        // 验证 record + transcript 被创建
        expect(mockRecordCreate).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1", source: "manual" }));
        expect(mockTranscriptCreate).toHaveBeenCalledWith(expect.objectContaining({ record_id: "rec-1" }));
        // 验证 processEntry 被调用
        expect(mockProcessEntry).toHaveBeenCalledWith(expect.objectContaining({
            text: "明天要交报告，还没开始写",
            recordId: "rec-1",
        }));
        // 验证 onboarding_done 被标记
        expect(mockUpsertOnboardingField).toHaveBeenCalledWith("user-1", "onboarding_done", "true", "dev-1");
    });
    it("should_mark_done_when_step_2_empty_skip", async () => {
        const { handleOnboardingChat } = await import("./onboarding.js");
        const result = await handleOnboardingChat({
            userId: "user-1",
            deviceId: "dev-1",
            step: 2,
            answer: "",
        });
        expect(result.step).toBe(2);
        expect(result.done).toBe(true);
        // 不创建 record
        expect(mockRecordCreate).not.toHaveBeenCalled();
        expect(mockProcessEntry).not.toHaveBeenCalled();
        // 标记完成
        expect(mockUpsertOnboardingField).toHaveBeenCalledWith("user-1", "onboarding_done", "true", "dev-1");
    });
    it("should_still_complete_when_process_fails", async () => {
        mockProcessEntry.mockRejectedValueOnce(new Error("AI failed"));
        const { handleOnboardingChat } = await import("./onboarding.js");
        const result = await handleOnboardingChat({
            userId: "user-1",
            deviceId: "dev-1",
            step: 2,
            answer: "一些想法",
        });
        expect(result.step).toBe(2);
        expect(result.done).toBe(true);
        // 无 AI 结果但不报错
        if (result.step === 2) {
            expect(result.summary).toBeUndefined();
        }
    });
});
//# sourceMappingURL=onboarding.test.js.map