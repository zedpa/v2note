import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildCalendarParams,
  buildAlarmParams,
  buildIntentActions,
  executeIntentQueue,
  dispatchIntents,
  type IntentTodoInput,
} from "./intent-dispatch";

// Mock @capacitor/app
vi.mock("@capacitor/app", () => {
  const listeners: Array<() => void> = [];
  return {
    App: {
      addListener: vi.fn((_event: string, cb: () => void) => {
        listeners.push(cb);
        return Promise.resolve({ remove: vi.fn() });
      }),
    },
    // 测试辅助：手动触发 resume 事件
    __triggerResume: () => {
      const cb = listeners.shift();
      if (cb) cb();
    },
    __listeners: listeners,
  };
});

/** 构造最小待办输入 */
function makeTodo(overrides: Partial<IntentTodoInput> = {}): IntentTodoInput {
  return {
    text: "买牛奶",
    scheduled_start: "2026-04-12T01:00:00.000Z", // 北京时间 09:00
    scheduled_end: null,
    estimated_minutes: null,
    reminder_before: 15,
    ...overrides,
  };
}

describe("buildCalendarParams — 场景 2.1: 构建日历 Intent 参数", () => {
  it("should_return_correct_params_when_scheduled_start_exists", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-12T01:00:00.000Z",
    });
    const params = buildCalendarParams(todo);
    expect(params).not.toBeNull();
    expect(params!.title).toBe("买牛奶");
    expect(params!.beginTime).toBe(new Date("2026-04-12T01:00:00.000Z").getTime());
    // 无 scheduled_end 且无 estimated_minutes → beginTime + 30 分钟
    expect(params!.endTime).toBe(params!.beginTime + 30 * 60 * 1000);
  });

  it("should_use_scheduled_end_when_available", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-12T01:00:00.000Z",
      scheduled_end: "2026-04-12T03:00:00.000Z",
    });
    const params = buildCalendarParams(todo);
    expect(params!.endTime).toBe(new Date("2026-04-12T03:00:00.000Z").getTime());
  });

  it("should_use_estimated_minutes_when_no_scheduled_end", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-12T01:00:00.000Z",
      estimated_minutes: 60,
    });
    const params = buildCalendarParams(todo);
    expect(params!.endTime).toBe(params!.beginTime + 60 * 60 * 1000);
  });

  it("should_return_null_when_scheduled_start_is_null", () => {
    const todo = makeTodo({ scheduled_start: null });
    expect(buildCalendarParams(todo)).toBeNull();
  });

  it("should_clamp_endTime_when_scheduled_end_before_start", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-12T03:00:00.000Z",
      scheduled_end: "2026-04-12T01:00:00.000Z", // end < start
    });
    const params = buildCalendarParams(todo);
    expect(params).not.toBeNull();
    // endTime 应被修正为 beginTime + 30 分钟默认值
    expect(params!.endTime).toBeGreaterThan(params!.beginTime);
    expect(params!.endTime).toBe(params!.beginTime + 30 * 60 * 1000);
  });
});

describe("buildAlarmParams — 场景 2.2: 构建闹钟 Intent 参数", () => {
  it("should_return_alarm_time_offset_by_reminder_before", () => {
    // scheduled_start = 2026-04-12T01:00:00Z (UTC) = 北京 09:00
    // reminder_before = 15 → 闹钟时间 = 北京 08:45
    const todo = makeTodo({
      scheduled_start: "2026-04-12T01:00:00.000Z",
      reminder_before: 15,
    });
    const params = buildAlarmParams(todo);
    expect(params).not.toBeNull();
    // 使用本地时间验证
    const expectedTime = new Date(
      new Date("2026-04-12T01:00:00.000Z").getTime() - 15 * 60 * 1000,
    );
    expect(params!.hour).toBe(expectedTime.getHours());
    expect(params!.minutes).toBe(expectedTime.getMinutes());
    expect(params!.message).toBe("买牛奶");
  });

  it("should_use_scheduled_start_time_when_reminder_before_is_null", () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-12T01:00:00.000Z",
      reminder_before: null,
    });
    const params = buildAlarmParams(todo);
    const expectedTime = new Date("2026-04-12T01:00:00.000Z");
    expect(params!.hour).toBe(expectedTime.getHours());
    expect(params!.minutes).toBe(expectedTime.getMinutes());
  });

  it("should_return_null_when_scheduled_start_is_null", () => {
    const todo = makeTodo({ scheduled_start: null });
    expect(buildAlarmParams(todo)).toBeNull();
  });
});

describe("buildIntentActions — 场景 2.3/2.4: 构建 Intent 动作列表", () => {
  const mockSystemIntent = {
    insertCalendarEvent: vi.fn(async () => {}),
    setAlarm: vi.fn(async () => {}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_build_calendar_action_when_types_include_calendar", () => {
    const todo = makeTodo();
    const actions = buildIntentActions(todo, ["calendar"], mockSystemIntent);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("calendar");
  });

  it("should_build_alarm_action_when_types_include_alarm", () => {
    const todo = makeTodo();
    const actions = buildIntentActions(todo, ["alarm"], mockSystemIntent);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("alarm");
  });

  it("should_build_both_actions_when_types_include_calendar_and_alarm", () => {
    const todo = makeTodo();
    const actions = buildIntentActions(
      todo,
      ["calendar", "alarm"],
      mockSystemIntent,
    );
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("calendar");
    expect(actions[1].type).toBe("alarm");
  });

  it("should_not_build_actions_for_notification_type", () => {
    const todo = makeTodo();
    const actions = buildIntentActions(todo, ["notification"], mockSystemIntent);
    expect(actions).toHaveLength(0);
  });

  it("should_skip_calendar_when_scheduled_start_is_null", () => {
    const todo = makeTodo({ scheduled_start: null });
    const actions = buildIntentActions(todo, ["calendar"], mockSystemIntent);
    expect(actions).toHaveLength(0);
  });

  it("should_skip_alarm_when_scheduled_start_is_null", () => {
    const todo = makeTodo({ scheduled_start: null });
    const actions = buildIntentActions(todo, ["alarm"], mockSystemIntent);
    expect(actions).toHaveLength(0);
  });

  it("should_call_insertCalendarEvent_with_correct_params_when_executed", async () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-12T01:00:00.000Z",
      estimated_minutes: 45,
    });
    const actions = buildIntentActions(todo, ["calendar"], mockSystemIntent);
    await actions[0].execute();
    expect(mockSystemIntent.insertCalendarEvent).toHaveBeenCalledWith({
      title: "买牛奶",
      description: "",
      beginTime: new Date("2026-04-12T01:00:00.000Z").getTime(),
      endTime: new Date("2026-04-12T01:00:00.000Z").getTime() + 45 * 60 * 1000,
    });
  });

  it("should_call_setAlarm_with_correct_params_when_executed", async () => {
    const todo = makeTodo({
      scheduled_start: "2026-04-12T01:00:00.000Z",
      reminder_before: 15,
    });
    const actions = buildIntentActions(todo, ["alarm"], mockSystemIntent);
    await actions[0].execute();
    const expectedTime = new Date(
      new Date("2026-04-12T01:00:00.000Z").getTime() - 15 * 60 * 1000,
    );
    expect(mockSystemIntent.setAlarm).toHaveBeenCalledWith({
      hour: expectedTime.getHours(),
      minutes: expectedTime.getMinutes(),
      message: "买牛奶",
    });
  });
});

describe("executeIntentQueue — 场景 2.4: Intent 队列执行", () => {
  it("should_return_noop_cleanup_when_no_actions", async () => {
    const cleanup = await executeIntentQueue([]);
    expect(typeof cleanup).toBe("function");
    // 调用 cleanup 不应报错
    cleanup();
  });

  it("should_execute_single_action_immediately", async () => {
    const execute = vi.fn(async () => {});
    await executeIntentQueue([{ type: "calendar", execute }]);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("should_execute_first_action_and_queue_rest_for_resume", async () => {
    const calendarExec = vi.fn(async () => {});
    const alarmExec = vi.fn(async () => {});
    await executeIntentQueue([
      { type: "calendar", execute: calendarExec },
      { type: "alarm", execute: alarmExec },
    ]);
    // 第一个立即执行
    expect(calendarExec).toHaveBeenCalledOnce();
    // 第二个等 resume
    expect(alarmExec).not.toHaveBeenCalled();

    // 模拟 App resume
    const { __triggerResume } = await import("@capacitor/app") as any;
    __triggerResume();
    // 等异步完成
    await vi.waitFor(() => {
      expect(alarmExec).toHaveBeenCalledOnce();
    });
  });

  it("should_not_throw_when_action_fails", async () => {
    const failingExec = vi.fn(async () => {
      throw new Error("Intent failed");
    });
    // 不应抛异常
    await expect(
      executeIntentQueue([{ type: "calendar", execute: failingExec }]),
    ).resolves.toBeDefined();
  });
});

describe("dispatchIntents — 场景 2.3/2.4: 完整调度流程", () => {
  const mockSystemIntent = {
    insertCalendarEvent: vi.fn(async () => {}),
    setAlarm: vi.fn(async () => {}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_call_insertCalendarEvent_when_types_include_calendar", async () => {
    const todo = makeTodo();
    await dispatchIntents(todo, ["calendar"], mockSystemIntent);
    expect(mockSystemIntent.insertCalendarEvent).toHaveBeenCalledOnce();
  });

  it("should_call_setAlarm_when_types_include_alarm", async () => {
    const todo = makeTodo();
    await dispatchIntents(todo, ["alarm"], mockSystemIntent);
    expect(mockSystemIntent.setAlarm).toHaveBeenCalledOnce();
  });

  it("should_not_trigger_intents_for_notification_only", async () => {
    const todo = makeTodo();
    await dispatchIntents(todo, ["notification"], mockSystemIntent);
    expect(mockSystemIntent.insertCalendarEvent).not.toHaveBeenCalled();
    expect(mockSystemIntent.setAlarm).not.toHaveBeenCalled();
  });

  it("should_handle_calendar_and_alarm_together", async () => {
    const todo = makeTodo();
    await dispatchIntents(todo, ["calendar", "alarm"], mockSystemIntent);
    // calendar 立即触发
    expect(mockSystemIntent.insertCalendarEvent).toHaveBeenCalledOnce();
    // alarm 等 resume（队列中第二个）
    expect(mockSystemIntent.setAlarm).not.toHaveBeenCalled();
  });

  it("should_not_trigger_intents_when_scheduled_start_is_null", async () => {
    const todo = makeTodo({ scheduled_start: null });
    await dispatchIntents(todo, ["calendar", "alarm"], mockSystemIntent);
    expect(mockSystemIntent.insertCalendarEvent).not.toHaveBeenCalled();
    expect(mockSystemIntent.setAlarm).not.toHaveBeenCalled();
  });

  it("should_return_cleanup_function", async () => {
    const todo = makeTodo();
    const cleanup = await dispatchIntents(todo, ["calendar"], mockSystemIntent);
    expect(typeof cleanup).toBe("function");
  });
});
