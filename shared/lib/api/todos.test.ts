import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the api module
vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { updateTodo, listTodos, createTodo, deleteTodo } from "./todos";
import { api } from "../api";

describe("todos API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateTodo", () => {
    it("sends PATCH with scheduling fields", async () => {
      vi.mocked(api.patch).mockResolvedValue(undefined);

      await updateTodo("todo-1", {
        scheduled_start: "2026-03-15T10:00:00",
        scheduled_end: "2026-03-15T11:00:00",
        estimated_minutes: 60,
        priority: 5,
      });

      expect(api.patch).toHaveBeenCalledWith("/api/v1/todos/todo-1", {
        scheduled_start: "2026-03-15T10:00:00",
        scheduled_end: "2026-03-15T11:00:00",
        estimated_minutes: 60,
        priority: 5,
      });
    });

    it("sends PATCH with text and done", async () => {
      vi.mocked(api.patch).mockResolvedValue(undefined);

      await updateTodo("todo-1", { text: "New text", done: true });

      expect(api.patch).toHaveBeenCalledWith("/api/v1/todos/todo-1", {
        text: "New text",
        done: true,
      });
    });

    it("sends PATCH to clear scheduling (null values)", async () => {
      vi.mocked(api.patch).mockResolvedValue(undefined);

      await updateTodo("todo-1", {
        scheduled_start: null,
        scheduled_end: null,
        estimated_minutes: null,
      });

      expect(api.patch).toHaveBeenCalledWith("/api/v1/todos/todo-1", {
        scheduled_start: null,
        scheduled_end: null,
        estimated_minutes: null,
      });
    });
  });

  describe("listTodos", () => {
    it("calls GET /api/v1/todos", async () => {
      vi.mocked(api.get).mockResolvedValue([]);
      const result = await listTodos();
      expect(api.get).toHaveBeenCalledWith("/api/v1/todos");
      expect(result).toEqual([]);
    });
  });

  describe("deleteTodo", () => {
    it("calls DELETE with correct path", async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);
      await deleteTodo("todo-1");
      expect(api.delete).toHaveBeenCalledWith("/api/v1/todos/todo-1");
    });
  });

  // fix-voice-todo-pipeline Phase 2: 前端 API 类型补齐
  describe("createTodo with reminder/recurrence fields", () => {
    it("sends POST with reminder and recurrence fields", async () => {
      vi.mocked(api.post).mockResolvedValue({ id: "t1" });

      await createTodo({
        text: "开会",
        scheduled_start: "2026-04-05T15:00:00",
        priority: 3,
        reminder_before: 30,
        reminder_types: ["notification"],
        recurrence_rule: "daily",
        recurrence_end: "2026-05-01",
        goal_id: "g1",
      });

      expect(api.post).toHaveBeenCalledWith("/api/v1/todos", {
        text: "开会",
        scheduled_start: "2026-04-05T15:00:00",
        priority: 3,
        reminder_before: 30,
        reminder_types: ["notification"],
        recurrence_rule: "daily",
        recurrence_end: "2026-05-01",
        goal_id: "g1",
      });
    });
  });

  describe("updateTodo with reminder/recurrence fields", () => {
    it("sends PATCH with reminder and recurrence fields", async () => {
      vi.mocked(api.patch).mockResolvedValue(undefined);

      await updateTodo("t1", {
        reminder_before: 15,
        reminder_types: ["notification"],
        recurrence_rule: "weekly:1",
        recurrence_end: "2026-06-01",
      });

      expect(api.patch).toHaveBeenCalledWith("/api/v1/todos/t1", {
        reminder_before: 15,
        reminder_types: ["notification"],
        recurrence_rule: "weekly:1",
        recurrence_end: "2026-06-01",
      });
    });
  });
});
