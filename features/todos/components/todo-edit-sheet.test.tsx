import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TodoEditSheet } from "./todo-edit-sheet";
import type { TodoDTO } from "../lib/todo-types";

// mock API
vi.mock("@/shared/lib/api/todos", () => ({
  updateTodo: vi.fn().mockResolvedValue({}),
  deleteTodo: vi.fn().mockResolvedValue({}),
}));

// mock date-utils
vi.mock("../lib/date-utils", () => ({
  parseScheduledTime: (ts: string) => new Date(ts),
}));

// mock time-slots
vi.mock("../lib/time-slots", () => ({
  localTzOffset: () => "+08:00",
}));

import { updateTodo } from "@/shared/lib/api/todos";

function makeTodo(overrides: Partial<TodoDTO> = {}): TodoDTO {
  return {
    id: "test-1",
    text: "测试待办",
    done: false,
    record_id: null,
    created_at: "2026-04-02T10:00:00Z",
    scheduled_start: null,
    scheduled_end: null,
    estimated_minutes: null,
    priority: null,
    domain: null,
    impact: null,
    ai_actionable: false,
    ai_action_plan: null,
    level: 0,
    parent_id: null,
    status: "active",
    goal_id: null,
    subtask_count: 0,
    subtask_done_count: 0,
    goal_title: null,
    reminder_at: null,
    reminder_before: null,
    reminder_types: null,
    ...overrides,
  };
}

const noop = () => {};

describe("TodoEditSheet — 提醒功能", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_show_reminder_options_when_date_is_set", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);
    // 应该能看到"提醒"标签
    expect(screen.getByText("提醒")).toBeTruthy();
    // 应该能看到提醒选项
    expect(screen.getByText("不提醒")).toBeTruthy();
    expect(screen.getByText("5分钟前")).toBeTruthy();
    expect(screen.getByText("15分钟前")).toBeTruthy();
    expect(screen.getByText("30分钟前")).toBeTruthy();
    expect(screen.getByText("1小时前")).toBeTruthy();
  });

  it("should_not_show_reminder_options_when_no_date", () => {
    const todo = makeTodo(); // 无 scheduled_start
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);
    // 不应显示提醒选项
    expect(screen.queryByText("提醒")).toBeNull();
  });

  it("should_highlight_current_reminder_before_value", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);
    const btn = screen.getByText("15分钟前");
    // 高亮 pill 应有 primary 相关的样式
    expect(btn.className).toContain("bg-primary");
  });

  it("should_send_reminder_before_in_updates_when_changed", async () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: null,
    });
    const onUpdated = vi.fn();
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} onUpdated={onUpdated} />);

    // 点击"30分钟前"
    fireEvent.click(screen.getByText("30分钟前"));
    // 点击保存
    fireEvent.click(screen.getByText("保存"));

    // 等待异步保存
    await vi.waitFor(() => {
      expect(updateTodo).toHaveBeenCalled();
    });
    const callArgs = vi.mocked(updateTodo).mock.calls[0];
    expect(callArgs[0]).toBe("test-1");
    expect(callArgs[1]).toHaveProperty("reminder_before", 30);
  });

  it("should_send_reminder_before_null_when_clearing_reminder", async () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);

    // 点击"不提醒"
    fireEvent.click(screen.getByText("不提醒"));
    // 点击保存
    fireEvent.click(screen.getByText("保存"));

    await vi.waitFor(() => {
      expect(updateTodo).toHaveBeenCalled();
    });
    const callArgs = vi.mocked(updateTodo).mock.calls[0];
    expect(callArgs[1]).toHaveProperty("reminder_before", null);
  });
});
