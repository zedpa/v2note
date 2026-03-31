import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock dependencies
const mockGetEmbedding = vi.fn();
const mockExecute = vi.fn();
const mockQuery = vi.fn();
vi.mock("../memory/embeddings.js", () => ({
    getEmbedding: (...args) => mockGetEmbedding(...args),
}));
vi.mock("../db/pool.js", () => ({
    execute: (...args) => mockExecute(...args),
    query: (...args) => mockQuery(...args),
}));
import { writeStrikeEmbedding, writeTodoEmbedding, backfillStrikeEmbeddings } from "./embed-writer.js";
describe("embed-writer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockExecute.mockResolvedValue(undefined);
    });
    describe("writeStrikeEmbedding", () => {
        it("should_write_embedding_when_api_succeeds", async () => {
            await writeStrikeEmbedding("strike-1", "铝价涨了15%");
            expect(mockGetEmbedding).toHaveBeenCalledWith("铝价涨了15%");
            expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("UPDATE strike SET embedding"), ["[0.1,0.2,0.3]", "strike-1"]);
        });
        it("should_not_throw_when_embedding_api_fails", async () => {
            mockGetEmbedding.mockRejectedValue(new Error("API timeout"));
            // 不应抛出异常
            await expect(writeStrikeEmbedding("strike-1", "test")).resolves.toBeUndefined();
            expect(mockExecute).not.toHaveBeenCalled();
        });
        it("should_not_throw_when_db_write_fails", async () => {
            mockExecute.mockRejectedValue(new Error("DB connection lost"));
            await expect(writeStrikeEmbedding("strike-1", "test")).resolves.toBeUndefined();
        });
    });
    describe("writeTodoEmbedding", () => {
        it("should_write_to_todo_embedding_when_level_0", async () => {
            await writeTodoEmbedding("todo-1", "买牛奶", 0);
            expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO todo_embedding"), ["todo-1", "[0.1,0.2,0.3]"]);
        });
        it("should_write_to_goal_embedding_when_level_gte_1", async () => {
            await writeTodoEmbedding("goal-1", "Q2产品发布", 1);
            expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO goal_embedding"), ["goal-1", "[0.1,0.2,0.3]"]);
        });
        it("should_default_level_to_0", async () => {
            await writeTodoEmbedding("todo-1", "买牛奶");
            expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("todo_embedding"), expect.any(Array));
        });
        it("should_upsert_on_conflict", async () => {
            await writeTodoEmbedding("todo-1", "买牛奶", 0);
            expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT"), expect.any(Array));
        });
        it("should_not_throw_when_api_fails", async () => {
            mockGetEmbedding.mockRejectedValue(new Error("API error"));
            await expect(writeTodoEmbedding("todo-1", "test")).resolves.toBeUndefined();
        });
    });
    describe("backfillStrikeEmbeddings", () => {
        it("should_backfill_strikes_without_embedding", async () => {
            mockQuery.mockResolvedValue([
                { id: "s1", nucleus: "text1" },
                { id: "s2", nucleus: "text2" },
            ]);
            const count = await backfillStrikeEmbeddings("user-1", 10);
            expect(count).toBe(2);
            expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("embedding IS NULL"), ["user-1", 10]);
            expect(mockExecute).toHaveBeenCalledTimes(2);
        });
        it("should_skip_failed_strikes_and_continue", async () => {
            mockQuery.mockResolvedValue([
                { id: "s1", nucleus: "text1" },
                { id: "s2", nucleus: "text2" },
                { id: "s3", nucleus: "text3" },
            ]);
            mockGetEmbedding
                .mockResolvedValueOnce([0.1])
                .mockRejectedValueOnce(new Error("fail"))
                .mockResolvedValueOnce([0.3]);
            const count = await backfillStrikeEmbeddings("user-1");
            expect(count).toBe(2); // s1 和 s3 成功，s2 失败
        });
        it("should_return_0_when_no_strikes_need_backfill", async () => {
            mockQuery.mockResolvedValue([]);
            const count = await backfillStrikeEmbeddings("user-1");
            expect(count).toBe(0);
        });
    });
});
//# sourceMappingURL=embed-writer.test.js.map