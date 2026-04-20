/**
 * 系统 Intent 封装 — 调起系统日历/闹钟 App
 * Native (Capacitor): 通过自定义插件 SystemIntentPlugin.kt 发送 Android Intent
 * Native (Harmony): 通过 JSBridge 调用系统能力（暂 no-op，后续实现）
 * Web: 静默跳过（no-op）
 */
import { getPlatform } from "./platform";

export interface SystemIntentPlugin {
  /** 调起系统日历新建事件页面 */
  insertCalendarEvent(options: {
    title: string;
    description?: string;
    beginTime: number; // 毫秒时间戳
    endTime: number; // 毫秒时间戳
  }): Promise<void>;

  /** 调起系统时钟新建闹钟页面 */
  setAlarm(options: {
    hour: number; // 0-23
    minutes: number; // 0-59
    message?: string;
  }): Promise<void>;
}

// Web/Harmony no-op: 非 Capacitor 平台静默跳过
const noopPlugin: SystemIntentPlugin = {
  insertCalendarEvent: async () => {},
  setAlarm: async () => {},
};

let _plugin: SystemIntentPlugin | null = null;

/**
 * 初始化插件（同步缓存，避免 async 函数 return Capacitor Proxy 触发 thenable check）
 * Capacitor registerPlugin 返回的 Proxy 会拦截 .then 访问，
 * 如果从 async 函数 return 该 Proxy，JS Promise 机制会触发 .then → 报错
 */
function ensurePlugin(): void {
  if (_plugin) return;

  const platform = getPlatform();

  if (platform === "capacitor") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { registerPlugin } = require("@capacitor/core");
      _plugin = registerPlugin<SystemIntentPlugin>("SystemIntent");
    } catch {
      _plugin = noopPlugin;
    }
  } else {
    _plugin = noopPlugin;
  }
}

const SystemIntent: SystemIntentPlugin = {
  async insertCalendarEvent(options) {
    ensurePlugin();
    return _plugin!.insertCalendarEvent(options);
  },
  async setAlarm(options) {
    ensurePlugin();
    return _plugin!.setAlarm(options);
  },
};

export default SystemIntent;
