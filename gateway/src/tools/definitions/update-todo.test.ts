import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/repositories/index.js", () => ({
  todoRepo: {
    update: vi.fn(),
    recalcReminderAt: vi.fn(),
  },
}));

import { updateTodoTool } from "./update-todo.js";
import { todoRepo } from "../../db/repositories/index.js";

const CTX = { deviceId: "dev-1", userId: "user-1", sessionId: "s-1" };

describe("update_todo — reminder 功能", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_clear_all_reminder_fields_when_reminder_before_is_null", async () => {
    const result = await updateTodoTool.handler({
      todo_id: "todo-1",
      reminder_before: null,
    }, CTX);

    expect(result.success).toBe(true);
    const updates = vi.mocked(todoRepo.update).mock.calls[0][1] as Record<string, any>;
    expect(updates.reminder_at).toBeNull();
    expect(updates.reminder_before).toBeNull();
    expect(updates.reminder_types).toBeNull();
  });

  it("should_trigger_recalcReminderAt_when_only_scheduled_start_changes", async () => {
    await updateTodoTool.handler({
      todo_id: "todo-1",
      scheduled_start: "2026-04-14T10:00:00+08:00",
    }, CTX);

    expect(todoRepo.update).toHaveBeenCalledWith("todo-1", expect.objectContaining({
      scheduled_start: "2026-04-14T10:00:00+08:00",
    }));
    expect(todoRepo.recalcReminderAt).toHaveBeenCalledWith("todo-1");
  });

  it("should_calculate_reminder_at_when_both_reminder_before_and_scheduled_start_provided", async () => {
    await updateTodoTool.handler({
      todo_id: "todo-1",
      scheduled_start: "2026-04-14T10:00:00+08:00",
      reminder_before: 30,
    }, CTX);

    const updates = vi.mocked(todoRepo.update).mock.calls[0][1] as Record<string, any>;
    expect(updates.reminder_before).toBe(30);
    const reminderAt = new Date(updates.reminder_at);
    const scheduledStart = new Date("2026-04-14T10:00:00+08:00");
    expect(scheduledStart.getTime() - reminderAt.getTime()).toBe(30 * 60000);
    // 不应触发 recalcReminderAt（已显式传了 reminder_before）
    expect(todoRepo.recalcReminderAt).not.toHaveBeenCalled();
  });

  it("should_trigger_recalcReminderAt_when_only_reminder_before_provided_without_scheduled_start", async () => {
    await updateTodoTool.handler({
      todo_id: "todo-1",
      reminder_before: 15,
    }, CTX);

    const updates = vi.mocked(todoRepo.update).mock.calls[0][1] as Record<string, any>;
    expect(updates.reminder_before).toBe(15);
    // 没有 scheduled_start，无法直接算 reminder_at，需要 recalc
    expect(todoRepo.recalcReminderAt).toHaveBeenCalledWith("todo-1");
  });

  it("should_update_only_reminder_types_when_reminder_before_not_provided", async () => {
    await updateTodoTool.handler({
      todo_id: "todo-1",
      reminder_types: ["alarm", "notification"],
    }, CTX);

    const updates = vi.mocked(todoRepo.update).mock.calls[0][1] as Record<string, any>;
    expect(updates.reminder_types).toEqual(["alarm", "notification"]);
    // 不应触发 recalc（没改时间也没改 reminder_before）
    expect(todoRepo.recalcReminderAt).not.toHaveBeenCalled();
  });

  it("should_update_reminder_types_along_with_reminder_before", async () => {
    await updateTodoTool.handler({
      todo_id: "todo-1",
      scheduled_start: "2026-04-14T10:00:00+08:00",
      reminder_before: 60,
      reminder_types: ["calendar"],
    }, CTX);

    const updates = vi.mocked(todoRepo.update).mock.calls[0][1] as Record<string, any>;
    expect(updates.reminder_before).toBe(60);
    expect(updates.reminder_types).toEqual(["calendar"]);
    expect(updates.reminder_at).toBeDefined();
  });
});
