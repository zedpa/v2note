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

// mock records API
vi.mock("@/shared/lib/api/records", () => ({
  getRecord: vi.fn().mockResolvedValue({
    id: "rec-1",
    transcript: { text: "这是语音转写的原文内容" },
  }),
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
import { getRecord } from "@/shared/lib/api/records";

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

describe("TodoEditSheet — 查看原文 (E3b)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_show_view_source_button_when_record_id_exists", () => {
    const todo = makeTodo({ record_id: "rec-1" });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);
    expect(screen.getByText("查看原文")).toBeTruthy();
  });

  it("should_not_show_view_source_button_when_record_id_is_null", () => {
    const todo = makeTodo({ record_id: null });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);
    expect(screen.queryByText("查看原文")).toBeNull();
  });

  it("should_fetch_and_display_transcript_when_view_source_clicked", async () => {
    const todo = makeTodo({ record_id: "rec-1" });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);

    // 点击"查看原文"按钮
    fireEvent.click(screen.getByText("查看原文"));

    // 应该调用 getRecord
    expect(getRecord).toHaveBeenCalledWith("rec-1");

    // 等待异步加载完成，显示转写文本
    await vi.waitFor(() => {
      expect(screen.getByText("这是语音转写的原文内容")).toBeTruthy();
    });
  });

  it("should_collapse_transcript_when_view_source_clicked_again", async () => {
    const todo = makeTodo({ record_id: "rec-1" });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);

    // 展开
    fireEvent.click(screen.getByText("查看原文"));
    await vi.waitFor(() => {
      expect(screen.getByText("这是语音转写的原文内容")).toBeTruthy();
    });

    // 再次点击收起（按钮文案变为"收起原文"）
    fireEvent.click(screen.getByText("收起原文"));
    expect(screen.queryByText("这是语音转写的原文内容")).toBeNull();
  });

  it("should_only_fetch_record_once_when_toggling", async () => {
    const todo = makeTodo({ record_id: "rec-1" });
    render(<TodoEditSheet todo={todo} open={true} onClose={noop} />);

    // 展开
    fireEvent.click(screen.getByText("查看原文"));
    await vi.waitFor(() => {
      expect(screen.getByText("这是语音转写的原文内容")).toBeTruthy();
    });

    // 收起
    fireEvent.click(screen.getByText("收起原文"));

    // 再次展开 — 不应再次 fetch
    fireEvent.click(screen.getByText("查看原文"));
    expect(getRecord).toHaveBeenCalledTimes(1);
    // 内容应该立即显示（已缓存）
    expect(screen.getByText("这是语音转写的原文内容")).toBeTruthy();
  });
});
