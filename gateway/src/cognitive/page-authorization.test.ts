import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB ──
const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockExecute = vi.fn();

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  execute: (...args: any[]) => mockExecute(...args),
}));

import {
  canAiModifyStructure,
  createSuggestion,
  acceptSuggestion,
  rejectSuggestion,
} from "./page-authorization.js";

// 合法 UUID
const PAGE_AI = "00000000-0000-4000-a000-000000000010";
const PAGE_USER = "00000000-0000-4000-a000-000000000011";
const USER_ID = "00000000-0000-4000-a000-000000000020";
const SUGGESTION_ID = "00000000-0000-4000-a000-000000000030";

describe("page-authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── canAiModifyStructure ──

  describe("canAiModifyStructure", () => {
    it("should_return_true_when_page_created_by_ai", () => {
      const result = canAiModifyStructure({ created_by: "ai" } as any);
      expect(result).toBe(true);
    });

    it("should_return_false_when_page_created_by_user", () => {
      const result = canAiModifyStructure({ created_by: "user" } as any);
      expect(result).toBe(false);
    });
  });

  // ── createSuggestion ──

  describe("createSuggestion", () => {
    it("should_insert_suggestion_and_return_it_when_valid_params", async () => {
      const mockSuggestion = {
        id: SUGGESTION_ID,
        user_id: USER_ID,
        suggestion_type: "split",
        payload: { source_id: PAGE_USER, reason: "内容过长" },
        status: "pending",
        created_at: "2026-04-11T10:00:00Z",
      };
      mockQueryOne.mockResolvedValue(mockSuggestion);

      const result = await createSuggestion(USER_ID, "split", {
        source_id: PAGE_USER,
        reason: "内容过长",
      });

      expect(result).toEqual(mockSuggestion);
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO wiki_compile_suggestion"),
        expect.arrayContaining([USER_ID, "split"]),
      );
    });
  });

  // ── acceptSuggestion ──

  describe("acceptSuggestion", () => {
    it("should_update_status_to_accepted_when_suggestion_exists", async () => {
      mockExecute.mockResolvedValue(undefined);

      await acceptSuggestion(SUGGESTION_ID, "test-user-id");

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("status = 'accepted'"),
        expect.arrayContaining([SUGGESTION_ID]),
      );
    });
  });

  // ── rejectSuggestion ──

  describe("rejectSuggestion", () => {
    it("should_update_status_to_rejected_when_suggestion_exists", async () => {
      mockExecute.mockResolvedValue(undefined);

      await rejectSuggestion(SUGGESTION_ID, "test-user-id");

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("status = 'rejected'"),
        expect.arrayContaining([SUGGESTION_ID]),
      );
    });
  });
});
