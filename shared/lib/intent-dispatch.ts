/**
 * Intent 调度器 — 待办保存后根据 reminder_types 触发系统 Intent
 *
 * 核心逻辑：
 * 1. notification → scheduleTodoReminder()（现有逻辑，无 UI 跳转）
 * 2. calendar → SystemIntent.insertCalendarEvent()
 * 3. alarm → SystemIntent.setAlarm()
 *
 * 多 Intent 队列：由于 startActivity 会离开 App，多个 Intent 不能连续触发。
 * 使用 App.resume 监听，App 回到前台后触发下一个 Intent。
 */

export type ReminderType = "notification" | "calendar" | "alarm";

/** Intent 调度所需的最小待办信息（避免依赖完整 TodoDTO） */
export interface IntentTodoInput {
  text: string;
  scheduled_start: string | null;
  scheduled_end?: string | null;
  estimated_minutes?: number | null;
  reminder_before?: number | null;
}

export interface IntentAction {
  type: "calendar" | "alarm";
  execute: () => Promise<void>;
}

/** 默认事件持续时间（分钟），当无 scheduled_end 和 estimated_minutes 时使用 */
const DEFAULT_EVENT_DURATION_MINUTES = 30;

/**
 * 根据待办数据构建日历 Intent 参数
 */
export function buildCalendarParams(todo: IntentTodoInput): {
  title: string;
  description: string;
  beginTime: number;
  endTime: number;
} | null {
  if (!todo.scheduled_start) return null;

  const begin = new Date(todo.scheduled_start);
  const beginTime = begin.getTime();

  let endTime: number;
  if (todo.scheduled_end) {
    endTime = new Date(todo.scheduled_end).getTime();
  } else if (todo.estimated_minutes) {
    endTime = beginTime + todo.estimated_minutes * 60 * 1000;
  } else {
    endTime = beginTime + DEFAULT_EVENT_DURATION_MINUTES * 60 * 1000;
  }

  // 确保 endTime >= beginTime
  if (endTime < beginTime) endTime = beginTime + DEFAULT_EVENT_DURATION_MINUTES * 60 * 1000;

  return {
    title: todo.text,
    description: "",
    beginTime,
    endTime,
  };
}

/**
 * 根据待办数据构建闹钟 Intent 参数
 * 闹钟时间 = scheduled_start 减去 reminder_before 分钟（本地时间）
 */
export function buildAlarmParams(todo: IntentTodoInput): {
  hour: number;
  minutes: number;
  message: string;
} | null {
  if (!todo.scheduled_start) return null;

  const start = new Date(todo.scheduled_start);
  const reminderBefore = todo.reminder_before ?? 0;
  const alarmTime = new Date(start.getTime() - reminderBefore * 60 * 1000);

  return {
    hour: alarmTime.getHours(),
    minutes: alarmTime.getMinutes(),
    message: todo.text,
  };
}

/**
 * 根据 reminder_types 构建需要执行的 Intent 动作列表
 * notification 不在此处理（由 scheduleTodoReminder 独立处理）
 */
export function buildIntentActions(
  todo: IntentTodoInput,
  reminderTypes: ReminderType[],
  systemIntent: {
    insertCalendarEvent: (opts: {
      title: string;
      description?: string;
      beginTime: number;
      endTime: number;
    }) => Promise<void>;
    setAlarm: (opts: {
      hour: number;
      minutes: number;
      message?: string;
    }) => Promise<void>;
  },
): IntentAction[] {
  const actions: IntentAction[] = [];

  if (reminderTypes.includes("calendar")) {
    const params = buildCalendarParams(todo);
    if (params) {
      actions.push({
        type: "calendar",
        execute: () => systemIntent.insertCalendarEvent(params),
      });
    }
  }

  if (reminderTypes.includes("alarm")) {
    const params = buildAlarmParams(todo);
    if (params) {
      actions.push({
        type: "alarm",
        execute: () => systemIntent.setAlarm(params),
      });
    }
  }

  return actions;
}

/**
 * 执行 Intent 队列。
 * 如果只有一个 Intent，直接执行。
 * 如果有多个，执行第一个后监听 App.resume 事件，逐个触发后续 Intent。
 * 队列清空后自动移除监听。
 *
 * @returns 清理函数，用于取消未完成的队列
 */
export async function executeIntentQueue(
  actions: IntentAction[],
): Promise<() => void> {
  if (actions.length === 0) return () => {};

  // 执行第一个 Intent
  const queue = [...actions];
  const first = queue.shift()!;
  try {
    await first.execute();
  } catch (e) {
    console.warn(`[intent-dispatch] ${first.type} Intent failed:`, e);
  }

  // 如果没有更多 Intent，直接返回
  if (queue.length === 0) return () => {};

  // 监听 App.resume 事件，逐个触发后续 Intent
  let cleanup: (() => void) | null = null;
  let cancelled = false;
  let executing = false; // 防止并发 resume 回调竞争

  try {
    const { App } = await import("@capacitor/app");
    const listener = await App.addListener("resume", async () => {
      if (cancelled || queue.length === 0 || executing) {
        if (queue.length === 0) listener.remove();
        return;
      }
      executing = true;
      const next = queue.shift()!;
      try {
        await next.execute();
      } catch (e) {
        console.warn(`[intent-dispatch] ${next.type} Intent failed:`, e);
      }
      executing = false;
      // 队列清空后移除监听
      if (queue.length === 0) {
        listener.remove();
      }
    });

    cleanup = () => {
      cancelled = true;
      listener.remove();
    };
  } catch {
    // Web 环境，无 App 插件，直接同步执行剩余 Intent（不会有 UI 跳转）
    for (const action of queue) {
      try {
        await action.execute();
      } catch (e) {
        console.warn(`[intent-dispatch] ${action.type} Intent failed:`, e);
      }
    }
  }

  return cleanup ?? (() => {});
}

/**
 * 待办保存后触发系统日历/闹钟 Intent
 * 注意：notification 类型不在此处理，由 todo-store refresh 回调的 scheduleTodoReminder 负责
 */
export async function dispatchIntents(
  todo: IntentTodoInput,
  reminderTypes: ReminderType[],
  systemIntent: {
    insertCalendarEvent: (opts: {
      title: string;
      description?: string;
      beginTime: number;
      endTime: number;
    }) => Promise<void>;
    setAlarm: (opts: {
      hour: number;
      minutes: number;
      message?: string;
    }) => Promise<void>;
  },
): Promise<() => void> {
  const intentActions = buildIntentActions(todo, reminderTypes, systemIntent);
  return executeIntentQueue(intentActions);
}
