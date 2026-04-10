import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 设置 ──
// 默认 Web 环境（非原生）
let mockIsNative = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSchedule = vi.fn((_opts?: any) => Promise.resolve());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCancel = vi.fn((_opts?: any) => Promise.resolve());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAddListener = vi.fn((_event?: any, _cb?: any) =>
  Promise.resolve({ remove: vi.fn() }),
);
const mockRequestPermissions = vi.fn(() =>
  Promise.resolve({ display: "granted" as string }),
);

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNative,
  },
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    schedule: (a: unknown) => mockSchedule(a),
    cancel: (a: unknown) => mockCancel(a),
    addListener: (a: unknown, b: unknown) => mockAddListener(a, b),
    requestPermissions: () => mockRequestPermissions(),
  },
}));

// 每次测试前重置模块缓存（因为 _isNative 是模块级缓存）
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockIsNative = false;
});

// ===================================================================
// 1. todoNotificationId — 确定性映射
// ===================================================================
describe("todoNotificationId", () => {
  it("should_return_deterministic_id_when_called_with_same_uuid", async () => {
    const { todoNotificationId } = await import("./notifications");
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const id1 = todoNotificationId(uuid);
    const id2 = todoNotificationId(uuid);
    expect(id1).toBe(id2);
  });

  it("should_return_different_ids_when_called_with_different_uuids", async () => {
    const { todoNotificationId } = await import("./notifications");
    const id1 = todoNotificationId("550e8400-e29b-41d4-a716-446655440000");
    const id2 = todoNotificationId("660e8400-e29b-41d4-a716-446655440001");
    expect(id1).not.toBe(id2);
  });

  it("should_return_id_in_range_10000_to_max_int32_when_given_any_uuid", async () => {
    const { todoNotificationId } = await import("./notifications");
    const uuids = [
      "550e8400-e29b-41d4-a716-446655440000",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "12345678-1234-1234-1234-123456789abc",
      "abcdef01-2345-6789-abcd-ef0123456789",
    ];
    for (const uuid of uuids) {
      const id = todoNotificationId(uuid);
      expect(id).toBeGreaterThanOrEqual(10000);
      expect(id).toBeLessThanOrEqual(2147483647);
      // 必须是整数
      expect(Number.isInteger(id)).toBe(true);
    }
  });

  it("should_not_conflict_with_daily_notification_ids_9001_9002", async () => {
    const { todoNotificationId } = await import("./notifications");
    const id = todoNotificationId("550e8400-e29b-41d4-a716-446655440000");
    expect(id).not.toBe(9001);
    expect(id).not.toBe(9002);
  });
});

// ===================================================================
// 2. scheduleTodoReminder — 调度逻辑
// ===================================================================
describe("scheduleTodoReminder", () => {
  it("should_schedule_notification_when_native_platform", async () => {
    mockIsNative = true;
    const { scheduleTodoReminder } = await import("./notifications");

    await scheduleTodoReminder({
      id: "550e8400-e29b-41d4-a716-446655440000",
      text: "开会讨论项目进度",
      reminder_at: "2026-04-11T00:45:00.000Z",
    });

    // 应先取消再调度
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledTimes(1);

    // 验证调度参数
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scheduleCall = (mockSchedule.mock.calls[0] as any)?.[0] as {
      notifications: Array<{
        id: number;
        title: string;
        body: string;
        schedule: { at: Date };
        extra: { action: string; todoId: string };
      }>;
    };
    const notification = scheduleCall.notifications[0];
    expect(notification.title).toBe("待办提醒");
    expect(notification.body).toBe("开会讨论项目进度");
    expect(notification.schedule.at).toBeInstanceOf(Date);
    expect(notification.schedule.at.toISOString()).toBe(
      "2026-04-11T00:45:00.000Z",
    );
    expect(notification.extra).toEqual({
      action: "todo-reminder",
      todoId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("should_cancel_before_schedule_when_called_for_same_todo", async () => {
    mockIsNative = true;
    const { scheduleTodoReminder, todoNotificationId } = await import(
      "./notifications"
    );
    const todoId = "550e8400-e29b-41d4-a716-446655440000";

    await scheduleTodoReminder({
      id: todoId,
      text: "测试幂等",
      reminder_at: "2026-04-11T00:45:00.000Z",
    });

    const expectedId = todoNotificationId(todoId);
    // 验证 cancel 被调用，参数包含正确 ID
    expect(mockCancel).toHaveBeenCalledWith({
      notifications: [{ id: expectedId }],
    });
    // cancel 先于 schedule 调用
    const cancelOrder = mockCancel.mock.invocationCallOrder[0];
    const scheduleOrder = mockSchedule.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(scheduleOrder);
  });

  it("should_request_permission_before_scheduling_when_native", async () => {
    mockIsNative = true;
    const { scheduleTodoReminder } = await import("./notifications");

    await scheduleTodoReminder({
      id: "550e8400-e29b-41d4-a716-446655440000",
      text: "测试权限",
      reminder_at: "2026-04-11T00:45:00.000Z",
    });

    expect(mockRequestPermissions).toHaveBeenCalled();
  });

  it("should_skip_schedule_when_permission_denied", async () => {
    mockIsNative = true;
    mockRequestPermissions.mockResolvedValueOnce({ display: "denied" });
    const { scheduleTodoReminder } = await import("./notifications");

    await scheduleTodoReminder({
      id: "550e8400-e29b-41d4-a716-446655440000",
      text: "测试权限拒绝",
      reminder_at: "2026-04-11T00:45:00.000Z",
    });

    // 权限被拒绝时不调度
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("should_noop_when_web_platform", async () => {
    mockIsNative = false;
    const { scheduleTodoReminder } = await import("./notifications");

    await scheduleTodoReminder({
      id: "550e8400-e29b-41d4-a716-446655440000",
      text: "Web 平台测试",
      reminder_at: "2026-04-11T00:45:00.000Z",
    });

    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("should_not_throw_when_schedule_fails", async () => {
    mockIsNative = true;
    mockSchedule.mockRejectedValueOnce(new Error("Native error"));
    const { scheduleTodoReminder } = await import("./notifications");

    // 不应抛出异常
    await expect(
      scheduleTodoReminder({
        id: "550e8400-e29b-41d4-a716-446655440000",
        text: "出错测试",
        reminder_at: "2026-04-11T00:45:00.000Z",
      }),
    ).resolves.toBeUndefined();
  });

  it("should_use_notification_id_from_todoNotificationId", async () => {
    mockIsNative = true;
    const { scheduleTodoReminder, todoNotificationId } = await import(
      "./notifications"
    );
    const todoId = "550e8400-e29b-41d4-a716-446655440000";
    const expectedId = todoNotificationId(todoId);

    await scheduleTodoReminder({
      id: todoId,
      text: "ID 验证",
      reminder_at: "2026-04-11T00:45:00.000Z",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scheduleCall = (mockSchedule.mock.calls[0] as any)?.[0] as {
      notifications: Array<{ id: number }>;
    };
    expect(scheduleCall.notifications[0].id).toBe(expectedId);
  });
});

// ===================================================================
// 3. cancelTodoReminder — 取消逻辑
// ===================================================================
describe("cancelTodoReminder", () => {
  it("should_cancel_notification_with_correct_id_when_native", async () => {
    mockIsNative = true;
    const { cancelTodoReminder, todoNotificationId } = await import(
      "./notifications"
    );
    const todoId = "550e8400-e29b-41d4-a716-446655440000";
    const expectedId = todoNotificationId(todoId);

    await cancelTodoReminder(todoId);

    expect(mockCancel).toHaveBeenCalledWith({
      notifications: [{ id: expectedId }],
    });
  });

  it("should_noop_when_web_platform", async () => {
    mockIsNative = false;
    const { cancelTodoReminder } = await import("./notifications");

    await cancelTodoReminder("550e8400-e29b-41d4-a716-446655440000");

    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("should_not_throw_when_cancel_fails", async () => {
    mockIsNative = true;
    mockCancel.mockRejectedValueOnce(new Error("Cancel error"));
    const { cancelTodoReminder } = await import("./notifications");

    await expect(
      cancelTodoReminder("550e8400-e29b-41d4-a716-446655440000"),
    ).resolves.toBeUndefined();
  });
});

// ===================================================================
// 4. syncTodoReminders — 同步逻辑
// ===================================================================
describe("syncTodoReminders", () => {
  const futureDate = "2099-12-31T23:59:00.000Z";
  const pastDate = "2020-01-01T00:00:00.000Z";

  it("should_schedule_pending_todos_with_future_reminder_at_when_native", async () => {
    mockIsNative = true;
    const { syncTodoReminders } = await import("./notifications");

    await syncTodoReminders([
      { id: "todo-1", text: "未来待办", done: false, reminder_at: futureDate },
      { id: "todo-2", text: "另一个", done: false, reminder_at: futureDate },
    ]);

    // 每条待办会先 cancel 再 schedule（幂等），加上权限请求
    // schedule 应被调用 2 次（每条待办一次）
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });

  it("should_skip_done_todos_when_syncing", async () => {
    mockIsNative = true;
    const { syncTodoReminders } = await import("./notifications");

    await syncTodoReminders([
      { id: "todo-1", text: "已完成", done: true, reminder_at: futureDate },
    ]);

    // done=true 的待办应调用 cancel 而不是 schedule
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("should_cancel_notification_for_todo_with_null_reminder_at_when_syncing", async () => {
    mockIsNative = true;
    const { syncTodoReminders, todoNotificationId } = await import("./notifications");

    await syncTodoReminders([
      { id: "todo-1", text: "无提醒", done: false, reminder_at: null },
    ]);

    // 无提醒的待办应 cancel 残留通知（场景 2.3）
    expect(mockSchedule).not.toHaveBeenCalled();
    const expectedId = todoNotificationId("todo-1");
    expect(mockCancel).toHaveBeenCalledWith({
      notifications: [{ id: expectedId }],
    });
  });

  it("should_skip_todos_with_past_reminder_at_when_syncing", async () => {
    mockIsNative = true;
    const { syncTodoReminders } = await import("./notifications");

    await syncTodoReminders([
      { id: "todo-1", text: "过期待办", done: false, reminder_at: pastDate },
    ]);

    // 过期的待办不调度
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("should_cancel_done_todos_that_had_reminder_when_syncing", async () => {
    mockIsNative = true;
    const { syncTodoReminders, todoNotificationId } = await import(
      "./notifications"
    );

    await syncTodoReminders([
      { id: "todo-1", text: "已完成", done: true, reminder_at: futureDate },
    ]);

    // done 的待办应该 cancel（清除可能残留的通知）
    const expectedId = todoNotificationId("todo-1");
    expect(mockCancel).toHaveBeenCalledWith({
      notifications: [{ id: expectedId }],
    });
  });

  it("should_handle_mixed_todos_correctly_when_syncing", async () => {
    mockIsNative = true;
    const { syncTodoReminders } = await import("./notifications");

    await syncTodoReminders([
      { id: "todo-1", text: "未来-未完成", done: false, reminder_at: futureDate },
      { id: "todo-2", text: "过期-未完成", done: false, reminder_at: pastDate },
      { id: "todo-3", text: "已完成", done: true, reminder_at: futureDate },
      { id: "todo-4", text: "无提醒", done: false, reminder_at: null },
    ]);

    // 只有 todo-1 应该被 schedule（未完成 + 未来时间）
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("should_noop_when_web_platform", async () => {
    mockIsNative = false;
    const { syncTodoReminders } = await import("./notifications");

    await syncTodoReminders([
      { id: "todo-1", text: "Web", done: false, reminder_at: futureDate },
    ]);

    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("should_handle_empty_array_when_syncing", async () => {
    mockIsNative = true;
    const { syncTodoReminders } = await import("./notifications");

    await syncTodoReminders([]);

    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

// ===================================================================
// 5. addForegroundNotificationSuppressor — 前台通知抑制
// ===================================================================
describe("addForegroundNotificationSuppressor", () => {
  it("should_register_localNotificationReceived_listener_when_native", async () => {
    mockIsNative = true;
    const { addForegroundNotificationSuppressor } = await import(
      "./notifications"
    );

    const cleanup = await addForegroundNotificationSuppressor();

    expect(mockAddListener).toHaveBeenCalledWith(
      "localNotificationReceived",
      expect.any(Function),
    );
    expect(typeof cleanup).toBe("function");
  });

  it("should_return_noop_cleanup_when_web_platform", async () => {
    mockIsNative = false;
    const { addForegroundNotificationSuppressor } = await import(
      "./notifications"
    );

    const cleanup = await addForegroundNotificationSuppressor();

    expect(mockAddListener).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe("function");
    // cleanup 可以安全调用
    cleanup();
  });

  it("should_return_working_cleanup_function_when_native", async () => {
    mockIsNative = true;
    const mockRemove = vi.fn();
    mockAddListener.mockResolvedValueOnce({ remove: mockRemove });
    const { addForegroundNotificationSuppressor } = await import(
      "./notifications"
    );

    const cleanup = await addForegroundNotificationSuppressor();
    cleanup();

    expect(mockRemove).toHaveBeenCalled();
  });
});

// ===================================================================
// 6. Web 平台全面降级
// ===================================================================
describe("Web 平台降级 — 所有待办通知操作 no-op", () => {
  it("should_not_call_any_capacitor_api_when_web_platform", async () => {
    mockIsNative = false;
    const {
      scheduleTodoReminder,
      cancelTodoReminder,
      syncTodoReminders,
      addForegroundNotificationSuppressor,
    } = await import("./notifications");

    await scheduleTodoReminder({
      id: "test",
      text: "test",
      reminder_at: "2099-01-01T00:00:00Z",
    });
    await cancelTodoReminder("test");
    await syncTodoReminders([
      { id: "test", text: "test", done: false, reminder_at: "2099-01-01T00:00:00Z" },
    ]);
    await addForegroundNotificationSuppressor();

    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
    // addListener 也不应被调用
    expect(mockAddListener).not.toHaveBeenCalled();
  });
});
