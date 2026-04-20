/**
 * Phase 4: Todo UI 集成 — 提醒类型选择 + dispatchIntents 调用
 * Spec: specs/todo-calendar-alarm.md 场景 2.1 ~ 2.4
 *
 * 注意：对称性已确认 — edit-sheet 和 create-sheet 均实现提醒类型选择，
 * 使用共享的 REMINDER_OPTIONS + REMINDER_TYPE_OPTIONS 常量
 */
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

// mock intent-dispatch
vi.mock("@/shared/lib/intent-dispatch", () => ({
  dispatchIntents: vi.fn().mockResolvedValue(() => {}),
}));

// mock system-intent
vi.mock("@/shared/lib/system-intent", () => ({
  default: {
    insertCalendarEvent: vi.fn().mockResolvedValue(undefined),
    setAlarm: vi.fn().mockResolvedValue(undefined),
  },
}));

// mock date-utils
vi.mock("../lib/date-utils", () => ({
  parseScheduledTime: (ts: string) => new Date(ts),
}));

// mock time-slots
vi.mock("../lib/time-slots", () => ({
  localTzOffset: () => "+08:00",
  getDefaultHourForSlot: () => 9,
}));

import { updateTodo } from "@/shared/lib/api/todos";
import { dispatchIntents } from "@/shared/lib/intent-dispatch";

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

describe("TodoEditSheet — 提醒类型 (reminder_types) UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_show_reminder_type_options_when_reminder_before_is_set", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);
    // 应该能看到提醒方式标签
    expect(screen.getByText("提醒方式")).toBeTruthy();
    // 应该能看到三种类型（按钮文字含 emoji 前缀）
    expect(screen.getByTestId("reminder-type-notification")).toBeTruthy();
    expect(screen.getByTestId("reminder-type-alarm")).toBeTruthy();
    expect(screen.getByTestId("reminder-type-calendar")).toBeTruthy();
  });

  it("should_hide_reminder_type_options_when_reminder_before_is_null", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: null,
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);
    // 不应显示提醒方式区域
    expect(screen.queryByText("提醒方式")).toBeNull();
  });

  it("should_highlight_existing_reminder_types_from_todo", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
      reminder_types: ["notification", "calendar"],
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);
    const calendarBtn = screen.getByTestId("reminder-type-calendar");
    const notifBtn = screen.getByTestId("reminder-type-notification");
    const alarmBtn = screen.getByTestId("reminder-type-alarm");
    // 已选中的应该有 primary 样式
    expect(calendarBtn.className).toContain("bg-primary");
    expect(notifBtn.className).toContain("bg-primary");
    // 未选中的不应该有 primary 样式
    expect(alarmBtn.className).not.toContain("bg-primary");
  });

  it("should_default_to_notification_when_todo_has_no_reminder_types", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
      reminder_types: null,
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);
    const notifBtn = screen.getByTestId("reminder-type-notification");
    expect(notifBtn.className).toContain("bg-primary");
  });

  it("should_send_reminder_types_in_updates_when_saved", async () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
      reminder_types: ["notification"],
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);

    // 勾选日历
    fireEvent.click(screen.getByTestId("reminder-type-calendar"));
    // 保存
    fireEvent.click(screen.getByText("保存"));

    await vi.waitFor(() => {
      expect(updateTodo).toHaveBeenCalled();
    });
    const callArgs = vi.mocked(updateTodo).mock.calls[0];
    expect(callArgs[1]).toHaveProperty("reminder_types");
    const types = (callArgs[1] as any).reminder_types;
    expect(types).toContain("notification");
    expect(types).toContain("calendar");
  });

  it("should_call_dispatchIntents_when_types_include_calendar", async () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
      reminder_types: ["notification", "calendar"],
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);

    // 直接保存（已有 calendar 类型）
    fireEvent.click(screen.getByText("保存"));

    await vi.waitFor(() => {
      expect(dispatchIntents).toHaveBeenCalled();
    });
    const args = vi.mocked(dispatchIntents).mock.calls[0];
    // 第一个参数是 todo input
    expect(args[0].text).toBe("测试待办");
    expect(args[0].scheduled_start).toBe("2026-04-13T09:00:00+08:00");
    // 第二个参数是 reminder types
    expect(args[1]).toContain("calendar");
  });

  it("should_call_dispatchIntents_when_types_include_alarm", async () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
      reminder_types: ["alarm"],
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);

    fireEvent.click(screen.getByText("保存"));

    await vi.waitFor(() => {
      expect(dispatchIntents).toHaveBeenCalled();
    });
    const args = vi.mocked(dispatchIntents).mock.calls[0];
    expect(args[1]).toContain("alarm");
  });

  it("should_not_call_dispatchIntents_when_types_only_notification", async () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
      reminder_types: ["notification"],
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);

    fireEvent.click(screen.getByText("保存"));

    await vi.waitFor(() => {
      expect(updateTodo).toHaveBeenCalled();
    });
    // 不应调用 dispatchIntents（仅 notification 不需要 Intent）
    expect(dispatchIntents).not.toHaveBeenCalled();
  });

  it("should_not_call_dispatchIntents_when_scheduled_start_is_empty", async () => {
    // 边界条件：无 scheduled_start 时不触发 Intent
    // 当 todo 没有 scheduled_start 时，提醒区域不显示，
    // 所以 reminderTypes 不会包含 calendar/alarm，不会触发 dispatchIntents
    const todo = makeTodo({
      text: "无日期待办",
      scheduled_start: null,
      reminder_before: null,
      reminder_types: null,
    });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);

    // 修改文字以触发保存
    const input = screen.getByDisplayValue("无日期待办");
    fireEvent.change(input, { target: { value: "修改后的文字" } });
    fireEvent.click(screen.getByText("保存"));

    await vi.waitFor(() => {
      expect(updateTodo).toHaveBeenCalled();
    });
    expect(dispatchIntents).not.toHaveBeenCalled();
  });
});

describe("TodoCreateSheet — 提醒功能", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_pass_reminder_before_and_types_to_onCreate", async () => {
    const { TodoCreateSheet } = await import("./todo-create-sheet");
    const onCreate = vi.fn().mockResolvedValue({ id: "new-1" });

    render(
      <TodoCreateSheet
        open={true}
        onClose={noop}
        onCreate={onCreate}
        defaultDate="2026-04-13"
      />,
    );

    // 输入文字
    const input = screen.getByTestId("todo-input");
    fireEvent.change(input, { target: { value: "新待办" } });

    // 选择提醒时间 15 分钟前
    fireEvent.click(screen.getByText("15分钟前"));

    // 选择闹钟类型
    fireEvent.click(screen.getByTestId("reminder-type-alarm"));

    // 提交
    fireEvent.click(screen.getByTestId("todo-submit"));

    await vi.waitFor(() => {
      expect(onCreate).toHaveBeenCalled();
    });
    const params = onCreate.mock.calls[0][0];
    expect(params.reminder_before).toBe(15);
    expect(params.reminder_types).toContain("alarm");
    expect(params.reminder_types).toContain("notification"); // 默认勾选
  });

  it("should_not_show_reminder_type_options_when_no_reminder_selected_in_create", async () => {
    const { TodoCreateSheet } = await import("./todo-create-sheet");
    const onCreate = vi.fn().mockResolvedValue({ id: "new-1" });

    render(
      <TodoCreateSheet
        open={true}
        onClose={noop}
        onCreate={onCreate}
        defaultDate="2026-04-13"
      />,
    );

    // 默认不选择提醒 → 不应显示提醒方式
    expect(screen.queryByText("提醒方式")).toBeNull();
  });

  it("should_call_dispatchIntents_after_create_when_types_include_calendar", async () => {
    const { TodoCreateSheet } = await import("./todo-create-sheet");
    const onCreate = vi.fn().mockResolvedValue({ id: "new-1" });

    render(
      <TodoCreateSheet
        open={true}
        onClose={noop}
        onCreate={onCreate}
        defaultDate="2026-04-13"
        defaultSlot="morning"
      />,
    );

    // 输入文字
    const input = screen.getByTestId("todo-input");
    fireEvent.change(input, { target: { value: "日历待办" } });

    // 选择提醒
    fireEvent.click(screen.getByText("15分钟前"));

    // 勾选日历
    fireEvent.click(screen.getByTestId("reminder-type-calendar"));

    // 提交
    fireEvent.click(screen.getByTestId("todo-submit"));

    await vi.waitFor(() => {
      expect(dispatchIntents).toHaveBeenCalled();
    });
    const args = vi.mocked(dispatchIntents).mock.calls[0];
    expect(args[1]).toContain("calendar");
  });
});
