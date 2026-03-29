/**
 * person-profile spec 测试
 * 场景 1: 高频人物识别 | 场景 2: 行为模式提取 | 场景 3: 画像查询
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mocks ─────────────────────────────────────────────────────────────
const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
const mockExecute = vi.fn().mockResolvedValue(0);
vi.mock("../db/pool.js", () => ({
    query: (...args) => mockQuery(...args),
    queryOne: (...args) => mockQueryOne(...args),
    execute: (...args) => mockExecute(...args),
}));
const mockChatCompletion = vi.fn();
vi.mock("../ai/provider.js", () => ({
    chatCompletion: (...args) => mockChatCompletion(...args),
}));
// ── Import after mocks ────────────────────────────────────────────────
const { scanPersons, extractPersonPatterns, getPersonContext } = await import("./person-profile.js");
// ── Tests ─────────────────────────────────────────────────────────────
beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});
describe("场景 1: 高频人物自动识别", () => {
    it("should_find_persons_mentioned_in_5_or_more_strikes", async () => {
        // 从 Strike tags 中提取人名频率
        mockQuery.mockResolvedValueOnce([
            { label: "张总", strike_count: "25" },
            { label: "老王", strike_count: "12" },
            { label: "小李", strike_count: "8" },
        ]);
        // 已存在的 person
        mockQuery.mockResolvedValueOnce([]);
        const result = await scanPersons("user-1");
        expect(result.newPersons).toBe(3);
        expect(mockExecute).toHaveBeenCalled(); // INSERT person
    });
    it("should_not_create_duplicate_persons", async () => {
        mockQuery
            .mockResolvedValueOnce([
            { label: "张总", strike_count: "20" },
        ])
            // 张总 已存在
            .mockResolvedValueOnce([{ name: "张总" }]);
        const result = await scanPersons("user-1");
        expect(result.newPersons).toBe(0);
    });
});
describe("场景 2: 行为模式提取", () => {
    it("should_extract_patterns_from_person_related_strikes", async () => {
        // person 存在
        mockQueryOne.mockResolvedValueOnce({ id: "p1", name: "老王", user_id: "user-1" });
        // 相关 Strike
        mockQuery.mockResolvedValueOnce([
            { nucleus: "老王不同意冒险方案", polarity: "perceive" },
            { nucleus: "老王建议先观望", polarity: "perceive" },
            { nucleus: "老王对风险很谨慎", polarity: "judge" },
        ]);
        mockChatCompletion.mockResolvedValue({
            content: JSON.stringify({
                patterns: ["在风险相关决策中倾向保守", "经常建议先观望再行动"],
            }),
        });
        const patterns = await extractPersonPatterns("p1");
        expect(patterns).toHaveLength(2);
        expect(patterns[0]).toContain("保守");
        expect(mockExecute).toHaveBeenCalled(); // 更新 patterns
    });
});
describe("场景 3: 参谋调用人物画像", () => {
    it("should_return_person_context_for_chat_injection", async () => {
        // 根据名字查 person
        mockQuery.mockResolvedValueOnce([
            {
                id: "p1",
                name: "老王",
                patterns: JSON.stringify(["风险决策倾向保守"]),
                stats: JSON.stringify({ mentionCount: 12, topClusters: ["供应链", "风控"] }),
            },
        ]);
        // 最近相关 Strike
        mockQuery.mockResolvedValueOnce([
            { nucleus: "老王说先不换供应商", polarity: "perceive", created_at: "2026-03-20" },
        ]);
        const ctx = await getPersonContext("user-1", ["老王"]);
        expect(ctx).toHaveLength(1);
        expect(ctx[0].name).toBe("老王");
        expect(ctx[0].patterns).toContain("风险决策倾向保守");
        expect(ctx[0].recentStrikes).toHaveLength(1);
    });
    it("should_return_empty_for_unknown_persons", async () => {
        mockQuery.mockResolvedValue([]);
        const ctx = await getPersonContext("user-1", ["陌生人"]);
        expect(ctx).toHaveLength(0);
    });
});
//# sourceMappingURL=person-profile.test.js.map