import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../../db/repositories/index.js", () => ({
    userProfileRepo: {
        upsertOnboardingField: vi.fn(),
        upsertPreferences: vi.fn(),
        findByUser: vi.fn(),
    },
}));
import { updateUserInfoTool } from "./update-user-info.js";
import { userProfileRepo } from "../../db/repositories/index.js";
const CTX = { deviceId: "dev-1", userId: "user-1", sessionId: "s-1" };
const NO_USER_CTX = { deviceId: "dev-1", sessionId: "s-1" };
describe("update_user_info", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    it("should_reject_when_no_userId", async () => {
        const result = await updateUserInfoTool.handler({}, NO_USER_CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("登录已过期");
    });
    it("should_reject_when_no_fields_provided", async () => {
        const result = await updateUserInfoTool.handler({}, CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("至少指定一个");
    });
    it("should_update_single_field", async () => {
        vi.mocked(userProfileRepo.findByUser).mockResolvedValue({
            name: "小明", occupation: null, current_focus: null,
            pain_points: null, review_time: null, preferences: {},
            onboarding_done: false,
        });
        const result = await updateUserInfoTool.handler({ name: "小明" }, CTX);
        expect(userProfileRepo.upsertOnboardingField).toHaveBeenCalledWith("user-1", "name", "小明", "dev-1");
        expect(result.success).toBe(true);
        expect(result.message).toContain("name");
    });
    it("should_update_multiple_fields", async () => {
        vi.mocked(userProfileRepo.findByUser).mockResolvedValue({
            name: "小明", occupation: "工程师", current_focus: null,
            pain_points: null, review_time: null, preferences: {},
            onboarding_done: true,
        });
        const result = await updateUserInfoTool.handler({
            name: "小明", occupation: "工程师",
        }, CTX);
        expect(userProfileRepo.upsertOnboardingField).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
        expect(result.data.name).toBe("小明");
        expect(result.data.occupation).toBe("工程师");
    });
    it("should_update_preferences_with_merge", async () => {
        vi.mocked(userProfileRepo.findByUser).mockResolvedValue({
            name: null, occupation: null, current_focus: null,
            pain_points: null, review_time: null,
            preferences: { theme: "dark", lang: "zh" },
            onboarding_done: false,
        });
        const result = await updateUserInfoTool.handler({
            preferences: { theme: "light" },
        }, CTX);
        expect(userProfileRepo.upsertPreferences).toHaveBeenCalledWith("user-1", { theme: "light" });
        expect(result.success).toBe(true);
    });
    it("should_have_notify_autonomy", () => {
        expect(updateUserInfoTool.autonomy).toBe("notify");
    });
});
//# sourceMappingURL=update-user-info.test.js.map