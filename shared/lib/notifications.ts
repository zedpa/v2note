/**
 * 日报本地通知调度
 * Native: Capacitor LocalNotifications
 * Web: 静默跳过（浏览器不支持可靠定时通知）
 */

let _isNative: boolean | null = null;

async function isNative(): Promise<boolean> {
  if (_isNative !== null) return _isNative;
  try {
    const { Capacitor } = await import("@capacitor/core");
    _isNative = Capacitor.isNativePlatform();
  } catch {
    _isNative = false;
  }
  return _isNative;
}

// 固定 ID，方便取消和更新
const MORNING_NOTIFICATION_ID = 9001;
const EVENING_NOTIFICATION_ID = 9002;

export interface NotificationScheduleOptions {
  morningHour: number;  // 0-23
  eveningHour: number;  // 0-23
  userName?: string;    // 个性化问候
}

/**
 * 请求通知权限。返回是否已授权。
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!(await isNative())) return false;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.requestPermissions();
    return result.display === "granted";
  } catch (e) {
    console.warn("[notifications] Permission request failed:", e);
    return false;
  }
}

/**
 * 检查通知权限状态。
 */
export async function checkNotificationPermission(): Promise<"granted" | "denied" | "prompt"> {
  if (!(await isNative())) return "denied";

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.checkPermissions();
    return result.display as "granted" | "denied" | "prompt";
  } catch {
    return "denied";
  }
}

/**
 * 调度每日晨报和晚报本地通知。
 * 会先取消旧的，再重新设定。
 */
export async function scheduleDailyNotifications(
  opts: NotificationScheduleOptions,
): Promise<void> {
  if (!(await isNative())) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // 先取消旧的日报通知
    await LocalNotifications.cancel({
      notifications: [
        { id: MORNING_NOTIFICATION_ID },
        { id: EVENING_NOTIFICATION_ID },
      ],
    });

    const name = opts.userName ?? "";
    const morningTitle = name ? `早上好${name}` : "早上好";
    const eveningTitle = name ? `${name}，今天辛苦了` : "今天辛苦了";

    // 计算下一次触发时间
    const now = new Date();

    const morningAt = nextOccurrence(now, opts.morningHour);
    const eveningAt = nextOccurrence(now, opts.eveningHour);

    await LocalNotifications.schedule({
      notifications: [
        {
          id: MORNING_NOTIFICATION_ID,
          title: morningTitle,
          body: "看看今天有什么安排？",
          schedule: {
            at: morningAt,
            repeats: true,
            every: "day",
          },
          extra: { action: "morning-briefing" },
        },
        {
          id: EVENING_NOTIFICATION_ID,
          title: eveningTitle,
          body: "看看今天完成了什么？",
          schedule: {
            at: eveningAt,
            repeats: true,
            every: "day",
          },
          extra: { action: "evening-summary" },
        },
      ],
    });

    console.log(`[notifications] Scheduled: morning=${opts.morningHour}:00, evening=${opts.eveningHour}:00`);
  } catch (e) {
    console.warn("[notifications] Schedule failed:", e);
  }
}

/**
 * 取消所有日报通知。
 */
export async function cancelDailyNotifications(): Promise<void> {
  if (!(await isNative())) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({
      notifications: [
        { id: MORNING_NOTIFICATION_ID },
        { id: EVENING_NOTIFICATION_ID },
      ],
    });
    console.log("[notifications] Cancelled daily notifications");
  } catch (e) {
    console.warn("[notifications] Cancel failed:", e);
  }
}

/**
 * 注册通知点击监听器。返回取消函数。
 * @param onAction 接收 "morning-briefing" | "evening-summary"
 */
export async function addNotificationClickListener(
  onAction: (action: string) => void,
): Promise<() => void> {
  if (!(await isNative())) return () => {};

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const listener = await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event) => {
        const action = event.notification?.extra?.action;
        if (action) {
          onAction(action);
        }
      },
    );
    return () => listener.remove();
  } catch {
    return () => {};
  }
}

// ── Helpers ──

/** 计算下一次某个小时整点的 Date */
function nextOccurrence(from: Date, hour: number): Date {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  // 如果今天的时间已过，推到明天
  if (d.getTime() <= from.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}
