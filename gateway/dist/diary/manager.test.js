import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../ai/provider.js", () => ({
    chatCompletion: vi.fn().mockResolvedValue({ content: "Summary line 1\nSummary line 2" }),
}));
vi.mock("../db/repositories/index.js", () => ({
    aiDiaryRepo: {
        upsertEntry: vi.fn().mockResolvedValue({ id: "d-1" }),
        findFull: vi.fn(),
        findSummaries: vi.fn(),
        updateSummary: vi.fn(),
    },
    notebookRepo: {
        ensureSystemNotebooks: vi.fn(),
    },
}));
vi.mock("../memory/long-term.js", () => ({
    loadMemory: vi.fn().mockResolvedValue([]),
    saveMemory: vi.fn(),
}));
vi.mock("../memory/manager.js", () => ({
    MemoryManager: class {
        maybeCreateMemory = vi.fn();
    },
}));
import { appendToDiary, regenerateSummary, extractToMemory } from "./manager.js";
import { aiDiaryRepo, notebookRepo } from "../db/repositories/index.js";
import { chatCompletion } from "../ai/provider.js";
describe("diary manager", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("appendToDiary", () => {
        it("ensures system notebooks exist and appends content", async () => {
            await appendToDiary("dev-1", "default", "Today I coded");
            expect(notebookRepo.ensureSystemNotebooks).toHaveBeenCalledWith("dev-1");
            expect(aiDiaryRepo.upsertEntry).toHaveBeenCalledWith("dev-1", "default", expect.any(String), // today's date
            "Today I coded");
        });
        it("uses today's date", async () => {
            const today = new Date().toISOString().split("T")[0];
            await appendToDiary("dev-1", "ai-self", "AI observation");
            const [, , date] = vi.mocked(aiDiaryRepo.upsertEntry).mock.calls[0];
            expect(date).toBe(today);
        });
    });
    describe("regenerateSummary", () => {
        it("generates summary via AI and saves it", async () => {
            vi.mocked(aiDiaryRepo.findFull).mockResolvedValue({
                id: "d-1",
                full_content: "Long diary content here...",
            });
            await regenerateSummary("dev-1", "default", "2026-03-12");
            expect(chatCompletion).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ role: "system" }),
                expect.objectContaining({ content: "Long diary content here..." }),
            ]), expect.any(Object));
            expect(aiDiaryRepo.updateSummary).toHaveBeenCalledWith("d-1", "Summary line 1\nSummary line 2");
        });
        it("skips when no entry found", async () => {
            vi.mocked(aiDiaryRepo.findFull).mockResolvedValue(null);
            await regenerateSummary("dev-1", "default", "2099-01-01");
            expect(chatCompletion).not.toHaveBeenCalled();
        });
        it("skips when entry has empty content", async () => {
            vi.mocked(aiDiaryRepo.findFull).mockResolvedValue({
                id: "d-1",
                full_content: "  ",
            });
            await regenerateSummary("dev-1", "default", "2026-03-12");
            expect(chatCompletion).not.toHaveBeenCalled();
        });
    });
    describe("extractToMemory", () => {
        it("skips when no diary entries in range", async () => {
            vi.mocked(aiDiaryRepo.findSummaries).mockResolvedValue([]);
            await extractToMemory("dev-1", { start: "2026-03-01", end: "2026-03-12" });
            expect(chatCompletion).not.toHaveBeenCalled();
        });
        it("calls AI to extract memories from diary summaries", async () => {
            vi.mocked(aiDiaryRepo.findSummaries).mockResolvedValue([
                { id: "d-1", entry_date: "2026-03-10", summary: "Worked on feature X", notebook: "default" },
                { id: "d-2", entry_date: "2026-03-11", summary: "Meeting with team", notebook: "default" },
            ]);
            await extractToMemory("dev-1", { start: "2026-03-01", end: "2026-03-12" });
            expect(chatCompletion).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ role: "user", content: expect.stringContaining("feature X") }),
            ]), expect.any(Object));
        });
    });
});
//# sourceMappingURL=manager.test.js.map