import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockGetEmbedding = vi.fn();
const mockExecute = vi.fn();

vi.mock("../memory/embeddings.js", () => ({
  getEmbedding: (...args: any[]) => mockGetEmbedding(...args),
}));
vi.mock("../db/pool.js", () => ({
  execute: (...args: any[]) => mockExecute(...args),
}));

import { writeTodoEmbedding, writeRecordEmbedding } from "./embed-writer.js";

describe("embed-writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockExecute.mockResolvedValue(undefined);
  });

  describe("writeTodoEmbedding", () => {
    it("should_write_to_todo_embedding_when_level_0", async () => {
      await writeTodoEmbedding("todo-1", "买牛奶", 0);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO todo_embedding"),
        ["todo-1", "[0.1,0.2,0.3]"],
      );
    });

    it("should_write_to_goal_embedding_when_level_gte_1", async () => {
      await writeTodoEmbedding("goal-1", "Q2产品发布", 1);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO goal_embedding"),
        ["goal-1", "[0.1,0.2,0.3]"],
      );
    });

    it("should_default_level_to_0", async () => {
      await writeTodoEmbedding("todo-1", "买牛奶");

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("todo_embedding"),
        expect.any(Array),
      );
    });

    it("should_upsert_on_conflict", async () => {
      await writeTodoEmbedding("todo-1", "买牛奶", 0);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT"),
        expect.any(Array),
      );
    });

    it("should_not_throw_when_api_fails", async () => {
      mockGetEmbedding.mockRejectedValue(new Error("API error"));

      await expect(writeTodoEmbedding("todo-1", "test")).resolves.toBeUndefined();
    });
  });

  describe("writeRecordEmbedding", () => {
    it("should_write_embedding_to_record", async () => {
      await writeRecordEmbedding("rec-1", "some text");

      expect(mockGetEmbedding).toHaveBeenCalledWith("some text");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE record SET embedding"),
        ["[0.1,0.2,0.3]", "rec-1"],
      );
    });

    it("should_not_throw_when_api_fails", async () => {
      mockGetEmbedding.mockRejectedValue(new Error("API timeout"));

      await expect(writeRecordEmbedding("rec-1", "test")).resolves.toBeUndefined();
    });
  });
});
