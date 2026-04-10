import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../../db/repositories/index.js", () => ({
    recordRepo: { findById: vi.fn() },
    transcriptRepo: { findByRecordId: vi.fn() },
    summaryRepo: { findByRecordId: vi.fn() },
    todoRepo: { findById: vi.fn(), findSubtasks: vi.fn() },
    goalRepo: { findById: vi.fn(), findWithTodos: vi.fn() },
    memoryRepo: { findById: vi.fn() },
    userProfileRepo: { findByUser: vi.fn() },
    soulRepo: { findByUser: vi.fn() },
    skillConfigRepo: { findByUser: vi.fn() },
}));
import { viewTool } from "./view.js";
import { recordRepo, transcriptRepo, summaryRepo, todoRepo, goalRepo, memoryRepo, userProfileRepo, soulRepo, skillConfigRepo, } from "../../db/repositories/index.js";
const CTX = { deviceId: "dev-1", userId: "user-1", sessionId: "s-1" };
const NO_USER_CTX = { deviceId: "dev-1", sessionId: "s-1" };
describe("view (unified)", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    // ── 登录校验 ──
    it("should_reject_when_no_userId", async () => {
        const result = await viewTool.handler({ type: "record", id: "rec-1" }, NO_USER_CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("登录已过期");
    });
    // ── 参数校验 ──
    it("should_reject_when_id_required_but_missing", async () => {
        const result = await viewTool.handler({ type: "record" }, CTX);
        expect(result.success).toBe(false);
        expect(result.message).toContain("id");
    });
    it("should_accept_profile_without_id", async () => {
        vi.mocked(userProfileRepo.findByUser).mockResolvedValue(null);
        const result = await viewTool.handler({ type: "profile" }, CTX);
        expect(result.success).toBe(true);
    });
    // ── record ──
    it("should_view_record_full_content", async () => {
        vi.mocked(recordRepo.findById).mockResolvedValue({
            id: "rec-1", user_id: "user-1", source: "voice",
            domain: "工作", created_at: "2026-04-06T10:00:00Z",
        });
        vi.mocked(transcriptRepo.findByRecordId).mockResolvedValue({ text: "日记内容" });
        vi.mocked(summaryRepo.findByRecordId).mockResolvedValue({ title: "标题" });
        const result = await viewTool.handler({ type: "record", id: "rec-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.type).toBe("record");
        expect(result.data.title).toBe("标题");
        expect(result.data.content).toBe("日记内容");
    });
    it("should_reject_record_of_other_user", async () => {
        vi.mocked(recordRepo.findById).mockResolvedValue({ id: "rec-1", user_id: "other" });
        const result = await viewTool.handler({ type: "record", id: "rec-1" }, CTX);
        expect(result.success).toBe(false);
    });
    // ── todo ──
    it("should_view_todo_with_subtasks", async () => {
        vi.mocked(todoRepo.findById).mockResolvedValue({
            id: "todo-1", text: "写周报", done: false, user_id: "user-1",
            priority: 3, created_at: "2026-04-06T10:00:00Z",
        });
        vi.mocked(todoRepo.findSubtasks).mockResolvedValue([
            { id: "sub-1", text: "子任务", done: false },
        ]);
        const result = await viewTool.handler({ type: "todo", id: "todo-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.type).toBe("todo");
        expect(result.data.subtasks).toHaveLength(1);
    });
    // ── goal ──
    it("should_view_goal_with_todo_stats", async () => {
        vi.mocked(goalRepo.findById).mockResolvedValue({
            id: "goal-1", title: "学 Rust", status: "active", user_id: "user-1",
        });
        vi.mocked(goalRepo.findWithTodos).mockResolvedValue([
            { id: "t-1", text: "看文档", done: true },
            { id: "t-2", text: "写练习", done: false },
        ]);
        const result = await viewTool.handler({ type: "goal", id: "goal-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.todo_stats).toEqual({ active: 1, completed: 1 });
    });
    // ── memory ──
    it("should_view_memory_details", async () => {
        vi.mocked(memoryRepo.findById).mockResolvedValue({
            id: "mem-1", content: "用户喜欢早起", importance: 8,
            source_date: "2026-04-01", created_at: "2026-04-01T10:00:00Z",
            user_id: "user-1",
        });
        const result = await viewTool.handler({ type: "memory", id: "mem-1" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.type).toBe("memory");
        expect(result.data.importance).toBe(8);
    });
    it("should_reject_memory_of_other_user", async () => {
        vi.mocked(memoryRepo.findById).mockResolvedValue({
            id: "mem-1", content: "secret", user_id: "other",
        });
        const result = await viewTool.handler({ type: "memory", id: "mem-1" }, CTX);
        expect(result.success).toBe(false);
    });
    // ── profile ──
    it("should_view_profile_when_exists", async () => {
        vi.mocked(userProfileRepo.findByUser).mockResolvedValue({
            name: "小明", occupation: "工程师", current_focus: "v2note",
            pain_points: null, review_time: "21:00", preferences: { theme: "dark" },
            onboarding_done: true, updated_at: "2026-04-06",
        });
        const result = await viewTool.handler({ type: "profile" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.name).toBe("小明");
        expect(result.data.onboarding_done).toBe(true);
    });
    it("should_return_empty_profile_when_not_exists", async () => {
        vi.mocked(userProfileRepo.findByUser).mockResolvedValue(null);
        const result = await viewTool.handler({ type: "profile" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.onboarding_done).toBe(false);
    });
    // ── soul ──
    it("should_view_soul_content", async () => {
        vi.mocked(soulRepo.findByUser).mockResolvedValue({
            content: "用户是一个关注效率的工程师", updated_at: "2026-04-06",
        });
        const result = await viewTool.handler({ type: "soul" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.content).toContain("工程师");
    });
    it("should_return_null_soul_when_not_exists", async () => {
        vi.mocked(soulRepo.findByUser).mockResolvedValue(null);
        const result = await viewTool.handler({ type: "soul" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.content).toBeNull();
    });
    // ── config ──
    it("should_view_skill_configs", async () => {
        vi.mocked(skillConfigRepo.findByUser).mockResolvedValue([
            { skill_name: "daily_report", enabled: true, config: { time: "08:00" } },
            { skill_name: "proactive_review", enabled: false, config: {} },
        ]);
        const result = await viewTool.handler({ type: "config" }, CTX);
        expect(result.success).toBe(true);
        expect(result.data.skills).toHaveLength(2);
    });
    // ── autonomy ──
    it("should_have_silent_autonomy", () => {
        expect(viewTool.autonomy).toBe("silent");
    });
});
//# sourceMappingURL=view.test.js.map