import { describe, it, expect } from "vitest";
import { filterByDate, groupByTimeSlot, buildProjectGroups } from "./todo-grouping";
import type { TodoDTO } from "./todo-types";

// ===== 工厂函数 =====

function makeTodo(overrides: Partial<TodoDTO> = {}): TodoDTO {
  return {
    id: overrides.id ?? "todo-1",
    text: overrides.text ?? "测试待办",
    done: overrides.done ?? false,
    record_id: null,
    created_at: overrides.created_at ?? "2026-03-31T10:00:00",
    scheduled_start: overrides.scheduled_start ?? null,
    scheduled_end: null,
    estimated_minutes: null,
    priority: null,
    domain: overrides.domain ?? null,
    impact: null,
    ai_actionable: false,
    ai_action_plan: null,
    level: overrides.level ?? 0,
    parent_id: overrides.parent_id ?? null,
    status: overrides.status ?? "active",
    goal_id: null,
    subtask_count: 0,
    subtask_done_count: 0,
    goal_title: null,
    reminder_at: null,
    reminder_before: null,
    ...overrides,
  };
}

// ===== filterByDate =====

describe("filterByDate", () => {
  it("should_include_todo_with_matching_scheduled_date", () => {
    const todos = [makeTodo({ scheduled_start: "2026-03-31T09:00:00" })];
    expect(filterByDate(todos, "2026-03-31")).toHaveLength(1);
  });

  it("should_exclude_todo_with_different_scheduled_date", () => {
    const todos = [makeTodo({ scheduled_start: "2026-04-01T09:00:00" })];
    expect(filterByDate(todos, "2026-03-31")).toHaveLength(0);
  });

  it("should_include_unscheduled_todo_created_on_date", () => {
    const todos = [makeTodo({ created_at: "2026-03-31T15:00:00", scheduled_start: null })];
    expect(filterByDate(todos, "2026-03-31")).toHaveLength(1);
  });

  it("should_exclude_unscheduled_todo_created_on_other_date", () => {
    const todos = [makeTodo({ created_at: "2026-03-30T15:00:00", scheduled_start: null })];
    expect(filterByDate(todos, "2026-03-31")).toHaveLength(0);
  });

  it("should_prioritize_scheduled_date_over_created_date", () => {
    // 创建于3/30但调度到3/31 → 在3/31出现
    const todos = [makeTodo({ created_at: "2026-03-30T08:00:00", scheduled_start: "2026-03-31T09:00:00" })];
    expect(filterByDate(todos, "2026-03-31")).toHaveLength(1);
    expect(filterByDate(todos, "2026-03-30")).toHaveLength(0);
  });

  it("should_include_done_todos_on_matching_date", () => {
    const todos = [makeTodo({ done: true, scheduled_start: "2026-03-31T09:00:00" })];
    expect(filterByDate(todos, "2026-03-31")).toHaveLength(1);
  });

  it("should_exclude_level_1_and_above_goals_projects", () => {
    const todos = [
      makeTodo({ level: 1, created_at: "2026-03-31T10:00:00" }),
      makeTodo({ level: 2, created_at: "2026-03-31T10:00:00" }),
    ];
    expect(filterByDate(todos, "2026-03-31")).toHaveLength(0);
  });
});

// ===== groupByTimeSlot =====

describe("groupByTimeSlot", () => {
  it("should_return_4_slot_groups", () => {
    const groups = groupByTimeSlot([]);
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.slot)).toEqual(["anytime", "morning", "afternoon", "evening"]);
  });

  it("should_assign_unscheduled_to_anytime", () => {
    const todos = [makeTodo({ scheduled_start: null })];
    const groups = groupByTimeSlot(todos);
    expect(groups[0].pending).toHaveLength(1); // anytime
    expect(groups[1].pending).toHaveLength(0); // morning
  });

  it("should_assign_9am_to_morning", () => {
    const todos = [makeTodo({ scheduled_start: "2026-03-31T09:00:00" })];
    const groups = groupByTimeSlot(todos);
    expect(groups[1].pending).toHaveLength(1); // morning
  });

  it("should_assign_14pm_to_afternoon", () => {
    const todos = [makeTodo({ scheduled_start: "2026-03-31T14:00:00" })];
    const groups = groupByTimeSlot(todos);
    expect(groups[2].pending).toHaveLength(1); // afternoon
  });

  it("should_assign_20pm_to_evening", () => {
    const todos = [makeTodo({ scheduled_start: "2026-03-31T20:00:00" })];
    const groups = groupByTimeSlot(todos);
    expect(groups[3].pending).toHaveLength(1); // evening
  });

  it("should_separate_done_into_completed_array", () => {
    const todos = [
      makeTodo({ id: "1", done: false, scheduled_start: "2026-03-31T09:00:00" }),
      makeTodo({ id: "2", done: true, scheduled_start: "2026-03-31T10:00:00" }),
    ];
    const morning = groupByTimeSlot(todos)[1];
    expect(morning.pending).toHaveLength(1);
    expect(morning.completed).toHaveLength(1);
    expect(morning.pending[0].id).toBe("1");
    expect(morning.completed[0].id).toBe("2");
  });

  it("should_distribute_mixed_todos_across_slots", () => {
    const todos = [
      makeTodo({ id: "1", scheduled_start: null }),
      makeTodo({ id: "2", scheduled_start: "2026-03-31T07:00:00" }),
      makeTodo({ id: "3", scheduled_start: "2026-03-31T13:00:00" }),
      makeTodo({ id: "4", scheduled_start: "2026-03-31T21:00:00" }),
    ];
    const groups = groupByTimeSlot(todos);
    expect(groups[0].pending).toHaveLength(1); // anytime
    expect(groups[1].pending).toHaveLength(1); // morning
    expect(groups[2].pending).toHaveLength(1); // afternoon
    expect(groups[3].pending).toHaveLength(1); // evening
  });
});

// ===== buildProjectGroups =====

describe("buildProjectGroups", () => {
  const project1 = makeTodo({
    id: "proj-1",
    text: "供应链优化",
    level: 1,
    status: "active",
    updated_at: "2026-03-31T10:00:00",
  });

  const project2 = makeTodo({
    id: "proj-2",
    text: "学习计划",
    level: 1,
    status: "active",
    updated_at: "2026-03-31T12:00:00",
  });

  it("should_group_children_under_parent_project", () => {
    const todos = [
      makeTodo({ id: "t1", parent_id: "proj-1", text: "子任务1" }),
      makeTodo({ id: "t2", parent_id: "proj-1", text: "子任务2" }),
    ];
    const groups = buildProjectGroups(todos, [project1]);
    expect(groups).toHaveLength(1);
    expect(groups[0].project?.id).toBe("proj-1");
    expect(groups[0].tasks).toHaveLength(2);
    expect(groups[0].isInbox).toBe(false);
  });

  it("should_put_orphan_todos_in_inbox", () => {
    const todos = [
      makeTodo({ id: "t1", parent_id: null, text: "散装任务" }),
    ];
    const groups = buildProjectGroups(todos, [project1]);
    // project1 有 0 个子任务，但仍显示
    // + "其他"分组有 1 个散装任务
    expect(groups).toHaveLength(2);
    const inbox = groups.find((g) => g.isInbox);
    expect(inbox).toBeDefined();
    expect(inbox!.tasks).toHaveLength(1);
    expect(inbox!.project).toBeNull();
  });

  it("should_sort_projects_by_updated_at_desc", () => {
    const todos: TodoDTO[] = [];
    const groups = buildProjectGroups(todos, [project1, project2]);
    // project2 更新时间更晚 → 排前面
    expect(groups[0].project?.id).toBe("proj-2");
    expect(groups[1].project?.id).toBe("proj-1");
  });

  it("should_count_pending_and_done_correctly", () => {
    const todos = [
      makeTodo({ id: "t1", parent_id: "proj-1", done: false }),
      makeTodo({ id: "t2", parent_id: "proj-1", done: true }),
      makeTodo({ id: "t3", parent_id: "proj-1", done: false }),
    ];
    const groups = buildProjectGroups(todos, [project1]);
    expect(groups[0].pendingCount).toBe(2);
    expect(groups[0].doneCount).toBe(1);
  });

  it("should_exclude_non_active_projects", () => {
    const archivedProject = makeTodo({
      id: "proj-archived",
      level: 1,
      status: "archived",
    });
    const groups = buildProjectGroups([], [archivedProject]);
    // 没有活跃项目 → 只有"其他"分组
    expect(groups).toHaveLength(1);
    expect(groups[0].isInbox).toBe(true);
  });

  it("should_show_inbox_when_no_projects", () => {
    const todos = [makeTodo({ id: "t1" })];
    const groups = buildProjectGroups(todos, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].isInbox).toBe(true);
    expect(groups[0].tasks).toHaveLength(1);
  });

  it("should_only_include_level_0_actions_in_groups", () => {
    const todos = [
      makeTodo({ id: "t1", parent_id: "proj-1", level: 0 }),
      makeTodo({ id: "g1", parent_id: "proj-1", level: 1 }), // 子目标，不应出现在任务列表
    ];
    const groups = buildProjectGroups(todos, [project1]);
    expect(groups[0].tasks).toHaveLength(1);
    expect(groups[0].tasks[0].id).toBe("t1");
  });
});
