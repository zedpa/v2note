/**
 * 系统 Intent 封装 — 调起系统日历/闹钟 App
 * Native: 通过 Capacitor 自定义插件 SystemIntentPlugin.kt 发送 Android Intent
 * Web: 静默跳过（no-op）
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

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

// Web no-op: 非原生平台静默跳过
const noopPlugin: SystemIntentPlugin = {
  insertCalendarEvent: async () => {},
  setAlarm: async () => {},
};

const SystemIntent: SystemIntentPlugin = Capacitor.isNativePlatform()
  ? registerPlugin<SystemIntentPlugin>("SystemIntent")
  : noopPlugin;

export default SystemIntent;
