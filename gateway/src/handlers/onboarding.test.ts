/**
 * Onboarding v4 测试 — Step 1 一次调用完成（存名字+标记 onboarding_done）
 * spec: fix-onboarding-step2-guide
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockUpsertOnboardingField = vi.fn().mockResolvedValue(undefined);

vi.mock("../db/repositories/index.js", () => ({
  userProfileRepo: {
    upsertOnboardingField: (...args: any[]) => mockUpsertOnboardingField(...args),
  },
}));

// =====================================================================

describe("Onboarding v4: 单步完成", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Step 1: 存名字 + 标记完成 ──

  it("should_save_name_and_mark_done_when_step_1", async () => {
    const { handleOnboardingChat } = await import("./onboarding.js");

    const result = await handleOnboardingChat({
      userId: "user-1",
      deviceId: "dev-1",
      step: 1,
      answer: "小明",
    });

    expect(result.step).toBe(1);
    expect(result.done).toBe(true);
    expect(result.name).toBe("小明");

    // 两次 upsert：name + onboarding_done
    expect(mockUpsertOnboardingField).toHaveBeenCalledTimes(2);
    expect(mockUpsertOnboardingField).toHaveBeenCalledWith("user-1", "name", "小明", "dev-1");
    expect(mockUpsertOnboardingField).toHaveBeenCalledWith("user-1", "onboarding_done", "true", "dev-1");
  });

  it("should_use_default_name_when_step_1_empty", async () => {
    const { handleOnboardingChat } = await import("./onboarding.js");

    const result = await handleOnboardingChat({
      userId: "user-1",
      deviceId: "dev-1",
      step: 1,
      answer: "",
    });

    expect(result.done).toBe(true);
    expect(result.name).toBe("用户");
    expect(mockUpsertOnboardingField).toHaveBeenCalledWith("user-1", "name", "用户", "dev-1");
  });

  // ── Step 2: 兼容旧前端 ──

  it("should_mark_done_for_step_2_compat", async () => {
    const { handleOnboardingChat } = await import("./onboarding.js");

    const result = await handleOnboardingChat({
      userId: "user-1",
      deviceId: "dev-1",
      step: 2,
      answer: "",
    });

    expect(result.step).toBe(2);
    expect(result.done).toBe(true);
    expect(mockUpsertOnboardingField).toHaveBeenCalledWith("user-1", "onboarding_done", "true", "dev-1");
  });

  it("should_not_return_ai_result_fields_when_step_2", async () => {
    const { handleOnboardingChat } = await import("./onboarding.js");

    const result = await handleOnboardingChat({
      userId: "user-1",
      deviceId: "dev-1",
      step: 2,
      answer: "一些想法",
    });

    expect(result.done).toBe(true);
    const resultObj = result as unknown as Record<string, unknown>;
    expect(resultObj.summary).toBeUndefined();
    expect(resultObj.todos).toBeUndefined();
    expect(resultObj.tags).toBeUndefined();
  });
});
