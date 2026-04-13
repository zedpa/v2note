import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { now as tzNow, APP_TZ } from "../../lib/tz.js";

export const getCurrentTimeTool: ToolDefinition = {
  name: "get_current_time",
  description: `获取当前真实时间。
必须调用：用户询问现在几点、今天星期几、今天日期时。
必须调用：回复中需要包含具体时间/日期信息时。
必须调用：创建待办、安排时间前确认当前时间。
禁止：从 system prompt 中的日期锚点读取时间后直接告诉用户——锚点仅供内部推理参考，不是实时数据。`,
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
