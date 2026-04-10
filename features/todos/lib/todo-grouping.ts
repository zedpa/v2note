import type { TodoDTO, ProjectGroup, TimeSlotGroup } from "./todo-types";
import { assignTimeSlot, TIME_SLOTS, type TimeSlot } from "./time-slots";
import { toLocalDate, toLocalDateStr, parseScheduledTime } from "./date-utils";

export function filterByDate(todos: TodoDTO[], dateStr: string): TodoDTO[] {
  return todos.filter((t) => {
    if (t.level > 0) return false; // 项目/目标不在时间视图

    // scheduled_start 是 UTC ISO 字符串，通过 parseScheduledTime 解析为本地 Date
    if (t.scheduled_start) return toLocalDateStr(parseScheduledTime(t.scheduled_start)) === dateStr;
    if (t.created_at) return toLocalDate(t.created_at) === dateStr;
    return false;
  });
}

/**
 * 将待办按时段分组，每个时段内未完成在前、已完成在后
 */
export function groupByTimeSlot(todos: TodoDTO[]): TimeSlotGroup[] {
  const groups: Record<TimeSlot, { pending: TodoDTO[]; completed: TodoDTO[] }> = {
    anytime: { pending: [], completed: [] },
    morning: { pending: [], completed: [] },
    afternoon: { pending: [], completed: [] },
    evening: { pending: [], completed: [] },
  };

  for (const todo of todos) {
    const slot = assignTimeSlot(todo.scheduled_start);
    if (todo.done) {
      groups[slot].completed.push(todo);
    } else {
      groups[slot].pending.push(todo);
    }
  }

  return TIME_SLOTS.map((config) => ({
    slot: config.key,
    pending: groups[config.key].pending,
    completed: groups[config.key].completed,
  }));
}

/**
 * 将待办按项目分组，散装任务归入"其他"
 * 项目按 updated_at 降序排列，"其他"固定末尾
 */
export function buildProjectGroups(
  allTodos: TodoDTO[],
  projects: TodoDTO[],
): ProjectGroup[] {
  const groups: ProjectGroup[] = [];

  // 活跃项目
  const activeProjects = projects
    .filter((p) => ["active", "progressing"].includes(p.status))
    .sort((a, b) => {
      const aTime = a.updated_at ?? a.created_at;
      const bTime = b.updated_at ?? b.created_at;
      return bTime.localeCompare(aTime);
    });

  // level=0 的任务按 parent_id 分桶
  const actionTodos = allTodos.filter((t) => t.level === 0);
  const childMap = new Map<string, TodoDTO[]>();
  const orphans: TodoDTO[] = [];

  for (const todo of actionTodos) {
    if (todo.parent_id) {
      const arr = childMap.get(todo.parent_id) ?? [];
      arr.push(todo);
      childMap.set(todo.parent_id, arr);
    } else {
      orphans.push(todo);
    }
  }

  // 为每个项目创建分组
  for (const project of activeProjects) {
    const tasks = childMap.get(project.id) ?? [];
    groups.push({
      project,
      tasks,
      pendingCount: tasks.filter((t) => !t.done).length,
      doneCount: tasks.filter((t) => t.done).length,
      isInbox: false,
    });
  }

  // "其他"虚拟分组
  if (orphans.length > 0 || activeProjects.length === 0) {
    groups.push({
      project: null,
      tasks: orphans,
      pendingCount: orphans.filter((t) => !t.done).length,
      doneCount: orphans.filter((t) => t.done).length,
      isInbox: true,
    });
  }

  return groups;
}
