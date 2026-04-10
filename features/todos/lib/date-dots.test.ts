import { describe, it, expect } from "vitest";
import { computeDateDots, type DotColor } from "./date-dots";
import type { TodoDTO } from "./todo-types";

/** 快速构造 TodoDTO */
function makeTodo(overrides: Partial<TodoDTO> = {}): TodoDTO {
  return {
    id: "t1",
    text: "test",
    done: false,
    level: 0,
    created_at: "2026-04-01T00:00:00Z",
    record_id: null,
    scheduled_start: null,
    scheduled_end: null,
    estimated_minutes: null,
    priority: null,
    domain: null,
    impact: null,
    ai_actionable: false,
    ai_action_plan: null,
    parent_id: null,
    cluster_id: null,
    status: "active",
    strike_id: null,
    goal_id: null,
    subtask_count: 0,
    subtask_done_count: 0,
    goal_title: null,
    reminder_at: null,
    reminder_before: null,
    ...overrides,
  };
}

describe("computeDateDots", () => {
  const today = "2026-04-02";

  it("should_return_empty_map_when_no_todos", () => {
    const result = computeDateDots([], new Set(), today);
    expect(result.size).toBe(0);
  });

  it("should_return_no_dot_when_all_todos_done", () => {
    const todos = [
      makeTodo({ id: "t1", scheduled_start: "2026-04-03T09:00:00Z", done: true }),
      makeTodo({ id: "t2", scheduled_start: "2026-04-03T14:00:00Z", done: true }),
    ];
    const result = computeDateDots(todos, new Set(), today);
    expect(result.has("2026-04-03")).toBe(false);
  });

  it("should_return_yellow_for_overdue_undone_todos", () => {
    const todos = [
      makeTodo({ id: "t1", scheduled_start: "2026-04-01T09:00:00Z", done: false }),
    ];
    const result = computeDateDots(todos, new Set(), today);
    expect(result.get("2026-04-01")).toBe("yellow");
  });

  it("should_return_yellow_even_if_date_was_viewed", () => {
    const todos = [
      makeTodo({ id: "t1", scheduled_start: "2026-04-01T09:00:00Z", done: false }),
    ];
    const viewed = new Set(["2026-04-01"]);
    const result = computeDateDots(todos, viewed, today);
    expect(result.get("2026-04-01")).toBe("yellow");
  });

  it("should_return_red_for_unviewed_future_undone_todos", () => {
    const todos = [
      makeTodo({ id: "t1", scheduled_start: "2026-04-05T09:00:00Z", done: false }),
    ];
    const result = computeDateDots(todos, new Set(), today);
    expect(result.get("2026-04-05")).toBe("red");
  });

  it("should_return_green_for_viewed_future_undone_todos", () => {
    const todos = [
      makeTodo({ id: "t1", scheduled_start: "2026-04-05T09:00:00Z", done: false }),
    ];
    const viewed = new Set(["2026-04-05"]);
    const result = computeDateDots(todos, viewed, today);
    expect(result.get("2026-04-05")).toBe("green");
  });

  it("should_return_red_for_today_unviewed_undone_todos", () => {
    const todos = [
      makeTodo({ id: "t1", scheduled_start: "2026-04-02T09:00:00Z", done: false }),
    ];
    const result = computeDateDots(todos, new Set(), today);
    expect(result.get("2026-04-02")).toBe("red");
  });

  it("should_return_green_for_today_viewed_undone_todos", () => {
    const todos = [
      makeTodo({ id: "t1", scheduled_start: "2026-04-02T09:00:00Z", done: false }),
    ];
    const viewed = new Set(["2026-04-02"]);
    const result = computeDateDots(todos, viewed, today);
    expect(result.get("2026-04-02")).toBe("green");
  });

  it("should_handle_mixed_dates_correctly", () => {
    const todos = [
      // 过期未完成 → yellow
      makeTodo({ id: "t1", scheduled_start: "2026-03-30T09:00:00Z", done: false }),
      // 已完成 → no dot
      makeTodo({ id: "t2", scheduled_start: "2026-04-01T09:00:00Z", done: true }),
      // 未来未查看 → red
      makeTodo({ id: "t3", scheduled_start: "2026-04-05T09:00:00Z", done: false }),
      // 未来已查看 → green
      makeTodo({ id: "t4", scheduled_start: "2026-04-10T09:00:00Z", done: false }),
    ];
    const viewed = new Set(["2026-04-10"]);
    const result = computeDateDots(todos, viewed, today);

    expect(result.get("2026-03-30")).toBe("yellow");
    expect(result.has("2026-04-01")).toBe(false);
    expect(result.get("2026-04-05")).toBe("red");
    expect(result.get("2026-04-10")).toBe("green");
  });

  it("should_skip_todos_without_scheduled_start", () => {
    const todos = [
      makeTodo({ id: "t1", done: false }), // no scheduled_start
    ];
    const result = computeDateDots(todos, new Set(), today);
    expect(result.size).toBe(0);
  });

  it("should_skip_level_gt_0_todos", () => {
    const todos = [
      makeTodo({ id: "t1", scheduled_start: "2026-04-05T09:00:00Z", done: false, level: 1 }),
    ];
    const result = computeDateDots(todos, new Set(), today);
    expect(result.size).toBe(0);
  });

  it("should_prioritize_yellow_over_red_on_same_date", () => {
    // 过期日期有一条完成一条未完成
    const todos = [
      makeTodo({ id: "t1", scheduled_start: "2026-04-01T09:00:00Z", done: true }),
      makeTodo({ id: "t2", scheduled_start: "2026-04-01T14:00:00Z", done: false }),
    ];
    const result = computeDateDots(todos, new Set(), today);
    expect(result.get("2026-04-01")).toBe("yellow");
  });
});
