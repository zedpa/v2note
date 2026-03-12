import { describe, it, expect } from "vitest";
import type { TodoItem } from "./types";

describe("TodoItem type", () => {
  it("includes scheduling fields", () => {
    const todo: TodoItem = {
      id: "1",
      text: "Test todo",
      done: false,
      source: null,
      record_id: "rec-1",
      created_at: "2026-03-12",
      scheduled_start: "2026-03-12T10:00:00",
      scheduled_end: "2026-03-12T11:00:00",
      estimated_minutes: 60,
      priority: 3,
      domain: "work",
      impact: 7,
      ai_actionable: true,
      ai_action_plan: ["Step 1", "Step 2"],
      goal_id: "goal-1",
    };

    expect(todo.scheduled_start).toBe("2026-03-12T10:00:00");
    expect(todo.scheduled_end).toBe("2026-03-12T11:00:00");
    expect(todo.estimated_minutes).toBe(60);
    expect(todo.priority).toBe(3);
  });

  it("allows optional scheduling fields to be undefined", () => {
    const todo: TodoItem = {
      id: "2",
      text: "Basic todo",
      done: false,
      source: null,
      record_id: "rec-2",
      created_at: "2026-03-12",
    };

    expect(todo.scheduled_start).toBeUndefined();
    expect(todo.estimated_minutes).toBeUndefined();
    expect(todo.priority).toBeUndefined();
  });
});
