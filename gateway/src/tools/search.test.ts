import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock repositories
vi.mock("../db/repositories/index.js", () => ({
  recordRepo: {
    searchByUser: vi.fn(),
    search: vi.fn(),
  },
  goalRepo: {
    findActiveByUser: vi.fn(),
    findActiveByDevice: vi.fn(),
  },
  todoRepo: {
    findPendingByUser: vi.fn(),
    findPendingByDevice: vi.fn(),
  },
  summaryRepo: {
    findByRecordIds: vi.fn().mockResolvedValue([]),
  },
}));

import { unifiedSearch } from "./search.js";
import { recordRepo, goalRepo, todoRepo, summaryRepo } from "../db/repositories/index.js";

// Helper: 创建符合 Record 接口的 mock
function mockRecord(id: string, overrides?: Record<string, any>) {
  return {
    id,
    device_id: "d1",
    status: "completed",
    source: "manual",
    audio_path: null,
    duration_seconds: null,
    location_text: null,
    notebook: null,
    source_type: "think",
    archived: false,
    digested: false,
    digested_at: null,
    created_at: "2026-03-20T10:00:00Z",
    updated_at: "2026-03-20T10:00:00Z",
    ...overrides,
  };
}

function mockGoal(id: string, title: string) {
  return {
    id,
    device_id: "d1",
    title,
    parent_id: null,
    status: "active" as const,
    source: "chat" as const,
    created_at: "2026-03-10",
    updated_at: "2026-03-10",
  };
}

function mockTodo(id: string, text: string) {
  return {
    id,
    record_id: "r1",
    text,
    done: false,
    estimated_minutes: null,
    scheduled_start: null,
    scheduled_end: null,
    priority: 0,
    completed_at: null,
    created_at: "2026-03-20",
  };
}

describe("unifiedSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("场景 2: scope 筛选", () => {
    it("should_search_records_when_scope_is_records", async () => {
      vi.mocked(recordRepo.searchByUser).mockResolvedValue([mockRecord("r1")]);
      vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([
        { record_id: "r1", title: "供应商会议记录", short_summary: "今天和张总讨论了供应商切换" } as any,
      ]);

      const results = await unifiedSearch(
        { query: "供应商", scope: "records" },
        { userId: "u1", deviceId: "d1" },
      );

      expect(recordRepo.searchByUser).toHaveBeenCalledWith("u1", "供应商");
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("record");
      expect(results[0].title).toBe("供应商会议记录");
    });

    it("should_search_goals_when_scope_is_goals", async () => {
      vi.mocked(goalRepo.findActiveByUser).mockResolvedValue([
        mockGoal("g1", "Q2产品发布"),
        mockGoal("g2", "供应商评估"),
      ]);

      const results = await unifiedSearch(
        { query: "供应商", scope: "goals" },
        { userId: "u1", deviceId: "d1" },
      );

      expect(goalRepo.findActiveByUser).toHaveBeenCalledWith("u1");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.title === "供应商评估")).toBe(true);
    });

    it("should_search_todos_when_scope_is_todos", async () => {
      vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
        mockTodo("t1", "联系供应商A报价"),
        mockTodo("t2", "写周报"),
      ]);

      const results = await unifiedSearch(
        { query: "供应商", scope: "todos" },
        { userId: "u1", deviceId: "d1" },
      );

      expect(todoRepo.findPendingByUser).toHaveBeenCalledWith("u1");
      expect(results.some((r) => r.title === "联系供应商A报价")).toBe(true);
      expect(results.every((r) => r.title !== "写周报")).toBe(true);
    });
  });

  describe("scope=all 跨实体搜索", () => {
    it("should_search_across_all_entity_types", async () => {
      vi.mocked(recordRepo.searchByUser).mockResolvedValue([mockRecord("r1")]);
      vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([
        { record_id: "r1", title: "供应商日记", short_summary: "讨论供应商" } as any,
      ]);
      vi.mocked(goalRepo.findActiveByUser).mockResolvedValue([
        mockGoal("g1", "供应商评估"),
      ]);
      vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
        mockTodo("t1", "供应商报价"),
      ]);

      const results = await unifiedSearch(
        { query: "供应商", scope: "all" },
        { userId: "u1", deviceId: "d1" },
      );

      const types = results.map((r) => r.type);
      expect(types).toContain("record");
      expect(types).toContain("goal");
      expect(types).toContain("todo");
    });
  });

  describe("limit 参数", () => {
    it("should_respect_limit_parameter", async () => {
      vi.mocked(recordRepo.searchByUser).mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => mockRecord(`r${i}`)),
      );
      vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([]);

      const results = await unifiedSearch(
        { query: "供应商", scope: "records", limit: 5 },
        { userId: "u1", deviceId: "d1" },
      );

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("should_default_to_10_results", async () => {
      vi.mocked(recordRepo.searchByUser).mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => mockRecord(`r${i}`)),
      );
      vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([]);

      const results = await unifiedSearch(
        { query: "记录", scope: "records" },
        { userId: "u1", deviceId: "d1" },
      );

      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  describe("fallback: deviceId 搜索", () => {
    it("should_fallback_to_device_search_when_no_userId", async () => {
      vi.mocked(recordRepo.search).mockResolvedValue([mockRecord("r1")]);
      vi.mocked(summaryRepo.findByRecordIds).mockResolvedValue([]);

      await unifiedSearch(
        { query: "测试", scope: "records" },
        { deviceId: "d1" },
      );

      expect(recordRepo.search).toHaveBeenCalledWith("d1", "测试");
      expect(recordRepo.searchByUser).not.toHaveBeenCalled();
    });
  });

  describe("空结果", () => {
    it("should_return_empty_array_when_no_matches", async () => {
      vi.mocked(recordRepo.searchByUser).mockResolvedValue([]);
      vi.mocked(goalRepo.findActiveByUser).mockResolvedValue([]);
      vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([]);

      const results = await unifiedSearch(
        { query: "不存在的东西", scope: "all" },
        { userId: "u1", deviceId: "d1" },
      );

      expect(results).toEqual([]);
    });
  });
});
