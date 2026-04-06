import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../db/pool.js", () => ({
    query: vi.fn(),
    queryOne: vi.fn(),
    execute: vi.fn(),
}));
vi.mock("../db/repositories/chat-message.js", () => ({
    getMessagesByDate: vi.fn(),
}));
vi.mock("../ai/provider.js", () => ({
    chatCompletion: vi.fn(),
}));
vi.mock("../db/repositories/ai-diary.js", () => ({
    upsertEntry: vi.fn(),
}));
vi.mock("../memory/manager.js", () => ({
    MemoryManager: vi.fn().mockImplementation(() => ({
        maybeCreateMemory: vi.fn().mockResolvedValue(undefined),
    })),
}));
import { generateChatDiary } from "./chat-daily-diary.js";
import { getMessagesByDate } from "../db/repositories/chat-message.js";
import { chatCompletion } from "../ai/provider.js";
import { upsertEntry } from "../db/repositories/ai-diary.js";
describe("chat-daily-diary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    // ── 场景 6.1: 每日对话总结 ──
    it("should_generate_diary_when_messages_exist", async () => {
        vi.mocked(getMessagesByDate).mockResolvedValue([
            { id: "m1", user_id: "u-1", role: "user", content: "今天做了什么", parts: null, compressed: false, created_at: "2026-04-06T10:00:00Z" },
            { id: "m2", user_id: "u-1", role: "assistant", content: "你今天完成了3个待办", parts: null, compressed: false, created_at: "2026-04-06T10:01:00Z" },
        ]);
        vi.mocked(chatCompletion).mockResolvedValue({ content: "用户和AI讨论了今天的进展..." });
        vi.mocked(upsertEntry).mockResolvedValue({});
        await generateChatDiary("dev-1", "u-1", "2026-04-06");
        expect(chatCompletion).toHaveBeenCalled();
        expect(upsertEntry).toHaveBeenCalledWith("dev-1", "chat-daily", "2026-04-06", expect.stringContaining("用户和AI讨论了"), "u-1");
    });
    // ── 场景 6.3: 无对话日跳过 ──
    it("should_skip_when_no_messages", async () => {
        vi.mocked(getMessagesByDate).mockResolvedValue([]);
        await generateChatDiary("dev-1", "u-1", "2026-04-06");
        expect(chatCompletion).not.toHaveBeenCalled();
        expect(upsertEntry).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=chat-daily-diary.test.js.map