import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import { upsertEntry, findByDate, findSummaries, findFull, updateSummary } from "./ai-diary.js";
import { query, queryOne, execute } from "../pool.js";

describe("ai-diary repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upsertEntry", () => {
    it("inserts new diary entry when none exists", async () => {
      const mockEntry = {
        id: "d-1",
        device_id: "dev-1",
        notebook: "default",
        entry_date: "2026-03-12",
        summary: "",
        full_content: "今天写了代码",
        created_at: "2026-03-12T00:00:00Z",
        updated_at: "2026-03-12T00:00:00Z",
      };
      // 第一次 queryOne: findFull → null（不存在）
      // 第二次 queryOne: INSERT RETURNING
      vi.mocked(queryOne)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockEntry);

      const result = await upsertEntry("dev-1", "default", "2026-03-12", "今天写了代码");
      expect(result).toEqual(mockEntry);
      // 第二次调用应该是 INSERT
      const insertSql = vi.mocked(queryOne).mock.calls[1][0];
      expect(insertSql).toContain("INSERT INTO ai_diary");
    });

    it("appends to existing entry via UPDATE", async () => {
      const existing = { id: "d-1", full_content: "Earlier" };
      const updated = { id: "d-1", full_content: "Earlier\n\nLater" };
      // 第一次 queryOne: findFull → 已存在
      // 第二次 queryOne: UPDATE RETURNING
      vi.mocked(queryOne)
        .mockResolvedValueOnce(existing as any)
        .mockResolvedValueOnce(updated as any);

      const result = await upsertEntry("dev-1", "default", "2026-03-12", "Later");
      expect(result.full_content).toContain("Later");
      // 第二次调用应该是 UPDATE with string concat
      const updateSql = vi.mocked(queryOne).mock.calls[1][0];
      expect(updateSql).toContain("full_content || ");
    });
  });

  describe("findByDate", () => {
    it("returns entries for a date across notebooks", async () => {
      vi.mocked(query).mockResolvedValue([
        { id: "d-1", notebook: "default" },
        { id: "d-2", notebook: "ai-self" },
      ] as any);

      const results = await findByDate("dev-1", "2026-03-12");
      expect(results).toHaveLength(2);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("entry_date"),
        ["dev-1", "2026-03-12"],
      );
    });
  });

  describe("findSummaries", () => {
    it("returns summaries within date range", async () => {
      vi.mocked(query).mockResolvedValue([
        { id: "d-1", entry_date: "2026-03-12", summary: "Summary 1", notebook: "default" },
      ] as any);

      const results = await findSummaries("dev-1", "default", "2026-03-01", "2026-03-12");
      expect(results).toHaveLength(1);
    });
  });

  describe("findFull", () => {
    it("returns full content", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "d-1",
        full_content: "Full diary content",
      } as any);

      const result = await findFull("dev-1", "default", "2026-03-12");
      expect(result?.full_content).toBe("Full diary content");
    });

    it("returns null when not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(null);
      const result = await findFull("dev-1", "default", "2099-01-01");
      expect(result).toBeNull();
    });
  });

  describe("updateSummary", () => {
    it("updates the summary field", async () => {
      vi.mocked(execute).mockResolvedValue(1);
      await updateSummary("d-1", "New summary");
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("summary"),
        ["New summary", "d-1"],
      );
    });
  });
});
