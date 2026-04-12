import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/repositories/index.js", () => ({
  recordRepo: { findById: vi.fn(), create: vi.fn() },
  todoRepo: { dedupCreate: vi.fn(), update: vi.fn() },
}));
vi.mock("../../cognitive/embed-writer.js", () => ({
  writeTodoEmbedding: vi.fn(),
}));

import { createTodoTool } from "./create-todo.js";
import { recordRepo, todoRepo } from "../../db/repositories/index.js";

const CTX = { deviceId: "dev-1", userId: "user-1", sessionId: "s-1" };

// 默认 mock 返回值
function setupMocks(overrides?: { action?: "created" | "matched" }) {
  vi.mocked(recordRepo.create).mockResolvedValue({ id: "rec-1" } as any);
  vi.mocked(todoRepo.dedupCreate).mockResolvedValue({
    todo: { id: "todo-1", text: "开会" },
    action: overrides?.action ?? "created",
  } as any);
  vi.mocked(todoRepo.update).mockResolvedValue(undefined as any);
}

describe("create_todo — reminder 功能", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_calculate_reminder_at_when_reminder_before_and_scheduled_start_provided", async () => {
    setupMocks();
    const result = await createTodoTool.handler({
      text: "开会",
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
      reminder_types: ["notification"],
    }, CTX);

    expect(result.success).toBe(true);
    // todoRepo.update 应被调用，且包含 reminder_at
    const updateCall = vi.mocked(todoRepo.update).mock.calls[0];
    expect(updateCall).toBeTruthy();
    const updates = updateCall[1] as Record<string, any>;
    expect(updates.reminder_before).toBe(15);
    expect(updates.reminder_types).toEqual(["notification"]);
    // reminder_at = 09:00 - 15min = 08:45 (UTC: 00:45)
    expect(updates.reminder_at).toBeDefined();
    const reminderAt = new Date(updates.reminder_at);
    const scheduledStart = new Date("2026-04-13T09:00:00+08:00");
    expect(scheduledStart.getTime() - reminderAt.getTime()).toBe(15 * 60000);
  });

  it("should_not_set_reminder_at_when_no_scheduled_start", async () => {
    setupMocks();
    const result = await createTodoTool.handler({
      text: "开会",
      reminder_before: 15,
    }, CTX);

    expect(result.success).toBe(true);
    // update 可能不被调用（只有 reminder_before 无 scheduled_start 时没其他字段）
    // 或者被调用但不含 reminder_at
    const calls = vi.mocked(todoRepo.update).mock.calls;
    if (calls.length > 0) {
      const updates = calls[0][1] as Record<string, any>;
      expect(updates.reminder_at).toBeUndefined();
    }
  });

  it("should_write_reminder_types_to_db_when_provided", async () => {
    setupMocks();
    await createTodoTool.handler({
      text: "开会",
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 30,
      reminder_types: ["alarm", "notification"],
    }, CTX);

    const updates = vi.mocked(todoRepo.update).mock.calls[0][1] as Record<string, any>;
    expect(updates.reminder_types).toEqual(["alarm", "notification"]);
  });

  it("should_apply_ensureTz_to_bare_time_for_reminder_at_calculation", async () => {
    setupMocks();
    await createTodoTool.handler({
      text: "开会",
      scheduled_start: "2026-04-13T09:00:00", // 裸时间
      reminder_before: 30,
    }, CTX);

    const updates = vi.mocked(todoRepo.update).mock.calls[0][1] as Record<string, any>;
    // 裸时间补 +08:00 后再计算
    const reminderAt = new Date(updates.reminder_at);
    const scheduledStart = new Date("2026-04-13T09:00:00+08:00");
    expect(scheduledStart.getTime() - reminderAt.getTime()).toBe(30 * 60000);
  });

  it("should_not_set_reminder_fields_when_deduped_as_matched", async () => {
    setupMocks({ action: "matched" });
    const result = await createTodoTool.handler({
      text: "开会",
      scheduled_start: "2026-04-13T09:00:00+08:00",
      reminder_before: 15,
    }, CTX);

    expect(result.success).toBe(true);
    expect(result.data?.deduplicated).toBe(true);
    // update 不应被调用
    expect(todoRepo.update).not.toHaveBeenCalled();
  });
});
