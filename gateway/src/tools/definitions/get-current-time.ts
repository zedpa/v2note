import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { now as tzNow, APP_TZ } from "../../lib/tz.js";

export const getCurrentTimeTool: ToolDefinition = {
  name: "get_current_time",
  description: `获取当前时间信息。
使用：需要知道今天日期、现在几点、今天星期几。
使用：创建待办/安排时间前，需要确认当前时间作为参考。
不用：不需要时间信息的操作。`,
  parameters: z.object({}),
  autonomy: "silent",
  handler: async () => {
    const now = tzNow();
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const weekday = `周${weekdays[now.getDay()]}`;
    const formatted = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekday} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    return {
      success: true,
      message: `当前时间: ${formatted}`,
      data: {
        iso: now.toISOString(),
        timestamp: now.getTime(),
        weekday,
        timezone: APP_TZ,
        formatted,
      },
    };
  },
};
