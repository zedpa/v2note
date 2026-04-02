import type { TodoDTO } from "./todo-types";
import { toLocalDate } from "./date-utils";

export type DotColor = "red" | "green" | "yellow";

/**
 * 计算每个日期的圆点颜色
 *
 * 优先级（高→低）：
 * 1. 所有待办已完成 → 无点
 * 2. 有过期未完成（date < today && !done）→ 黄点
 * 3. 有未完成 + 未查看 → 红点
 * 4. 有未完成 + 已查看 → 绿点
 * 5. 无待办 → 无点
 */
export function computeDateDots(
  todos: TodoDTO[],
  viewedDates: Set<string>,
  today: string,
): Map<string, DotColor> {
  // 按日期分组：每个日期的 { hasUndone, hasOverdue }
  const dateInfo = new Map<string, { hasUndone: boolean; hasOverdue: boolean }>();

  for (const todo of todos) {
    if (!todo.scheduled_start) continue;
    if ((todo.level ?? 0) > 0) continue;

    const dateStr = toLocalDate(todo.scheduled_start);

    let info = dateInfo.get(dateStr);
    if (!info) {
      info = { hasUndone: false, hasOverdue: false };
      dateInfo.set(dateStr, info);
    }

    if (!todo.done) {
      info.hasUndone = true;
      if (dateStr < today) {
        info.hasOverdue = true;
      }
    }
  }

  const result = new Map<string, DotColor>();

  for (const [dateStr, info] of dateInfo) {
    if (!info.hasUndone) continue; // 全部完成 → 无点

    if (info.hasOverdue) {
      result.set(dateStr, "yellow");
    } else if (viewedDates.has(dateStr)) {
      result.set(dateStr, "green");
    } else {
      result.set(dateStr, "red");
    }
  }

  return result;
}
