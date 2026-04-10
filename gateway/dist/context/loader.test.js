import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../memory/long-term.js", () => ({
    loadMemory: vi.fn().mockResolvedValue([]),
}));
vi.mock("../soul/manager.js", () => ({
    loadSoul: vi.fn().mockResolvedValue({ content: "Soul content" }),
}));
vi.mock("../profile/manager.js", () => ({
    loadProfile: vi.fn().mockResolvedValue({ content: "Profile content" }),
}));
vi.mock("../db/repositories/index.js", () => ({
    goalRepo: {
        findActiveByDevice: vi.fn().mockResolvedValue([]),
        findActiveByUser: vi.fn().mockResolvedValue([]),
    },
    soulRepo: {
        findByUser: vi.fn().mockResolvedValue({ content: "Soul content" }),
    },
    userProfileRepo: {
        findByUser: vi.fn().mockResolvedValue({ content: "Profile content" }),
    },
}));
vi.mock("../db/repositories/memory.js", () => ({
    findByUser: vi.fn().mockResolvedValue([]),
}));
vi.mock("../lib/text-utils.js", () => ({
    extractKeywords: vi.fn().mockReturnValue(new Set()),
}));
vi.mock("../memory/embeddings.js", () => ({
    semanticSearch: vi.fn().mockRejectedValue(new Error("not available")),
}));
const { mockLoadWikiContext } = vi.hoisted(() => ({
    mockLoadWikiContext: vi.fn().mockResolvedValue([]),
}));
vi.mock("../tools/wiki-search.js", () => ({
    loadWikiContext: mockLoadWikiContext,
}));
import { loadWarmContext } from "./loader.js";
import { loadProfile } from "../profile/manager.js";
import { loadSoul } from "../soul/manager.js";
describe("context loader", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("loadWarmContext", () => {
        it("includes userProfile in returned context", async () => {
            const ctx = await loadWarmContext({
                deviceId: "dev-1",
                mode: "chat",
            });
            expect(ctx.userProfile).toBe("Profile content");
            expect(ctx.soul).toBe("Soul content");
        });
        it("loads profile in briefing mode", async () => {
            const ctx = await loadWarmContext({
                deviceId: "dev-1",
                mode: "briefing",
            });
            expect(loadProfile).toHaveBeenCalledWith("dev-1");
            expect(ctx.userProfile).toBe("Profile content");
        });
        it("skips soul when localSoul is provided", async () => {
            const ctx = await loadWarmContext({
                deviceId: "dev-1",
                mode: "chat",
                localSoul: "Local soul content",
            });
            expect(loadSoul).not.toHaveBeenCalled();
            expect(ctx.soul).toBe("Local soul content");
        });
        it("handles profile load failure gracefully", async () => {
            vi.mocked(loadProfile).mockRejectedValue(new Error("DB error"));
            const ctx = await loadWarmContext({
                deviceId: "dev-1",
                mode: "chat",
            });
            expect(ctx.userProfile).toBeUndefined();
            // Should not throw
        });
    });
    describe("wikiContext (场景 4.2: Chat 参谋搜索上下文)", () => {
        it("should_include_wikiContext_when_userId_and_inputText_provided", async () => {
            mockLoadWikiContext.mockResolvedValue([
                "铝价分析: 铝价走势和影响因素分析",
                "采购策略: 采购策略和供应商管理",
            ]);
            const ctx = await loadWarmContext({
                deviceId: "dev-1",
                userId: "user-1",
                mode: "chat",
                inputText: "铝价最近怎么样",
            });
            expect(ctx.wikiContext).toBeDefined();
            expect(ctx.wikiContext).toHaveLength(2);
            expect(ctx.wikiContext[0]).toContain("铝价分析");
            expect(mockLoadWikiContext).toHaveBeenCalledWith("user-1", "铝价最近怎么样");
        });
        it("should_not_include_wikiContext_when_no_userId", async () => {
            const ctx = await loadWarmContext({
                deviceId: "dev-1",
                mode: "chat",
                inputText: "测试",
            });
            // 没有 userId 时不调用 wiki context
            expect(mockLoadWikiContext).not.toHaveBeenCalled();
            expect(ctx.wikiContext).toBeUndefined();
        });
        it("should_not_include_wikiContext_when_wiki_returns_empty", async () => {
            mockLoadWikiContext.mockResolvedValue([]);
            const ctx = await loadWarmContext({
                deviceId: "dev-1",
                userId: "user-1",
                mode: "chat",
                inputText: "无关内容",
            });
            expect(ctx.wikiContext).toBeUndefined();
        });
        it("should_handle_wiki_context_load_failure_gracefully", async () => {
            mockLoadWikiContext.mockRejectedValue(new Error("DB error"));
            const ctx = await loadWarmContext({
                deviceId: "dev-1",
                userId: "user-1",
                mode: "chat",
                inputText: "测试",
            });
            // 不应该抛出错误
            expect(ctx.wikiContext).toBeUndefined();
        });
    });
});
//# sourceMappingURL=loader.test.js.map