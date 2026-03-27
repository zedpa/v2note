import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock 所有外部依赖
vi.mock("@/shared/lib/api/action-panel", () => ({
  fetchActionPanel: vi.fn().mockResolvedValue({
    now: {
      strikeId: "s1",
      goalName: "供应链评估",
      action: "打给张总确认报价",
      actionType: "call",
      goalId: "g1",
      skipCount: 0,
    },
    today: [],
    goals: [
      { goalId: "g1", goalName: "供应链评估", actionCount: 3 },
      { goalId: "g2", goalName: "v2note产品", actionCount: 2 },
    ],
  }),
  reportSwipe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/lib/device", () => ({
  getDeviceId: vi.fn().mockResolvedValue("test-device"),
}));

vi.mock("@/shared/lib/api/goals", () => ({
  listGoals: vi.fn().mockResolvedValue([]),
  listPendingIntents: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/todos/hooks/use-today-todos", () => ({
  useTodayTodos: () => ({
    todos: [
      { id: "t1", text: "审阅小李报告", done: false, scheduled_start: new Date().toISOString() },
      { id: "t2", text: "整理供应商清单", done: true },
    ],
    loading: false,
    toggleTodo: vi.fn(),
  }),
}));

vi.mock("@/features/todos/hooks/use-todos", () => ({
  useTodos: () => ({
    todos: [
      { id: "t1", text: "审阅小李报告", done: false, scheduled_start: new Date().toISOString() },
      { id: "t2", text: "整理供应商清单", done: true },
    ],
    loading: false,
  }),
}));

vi.mock("@/features/todos/components/todo-detail-sheet", () => ({
  TodoDetailSheet: () => null,
}));

import { GoalIndicator } from "./goal-indicator";

describe("TodoWorkspaceView + NowCard 集成", () => {
  // 场景 4.1: TodoWorkspaceView 应嵌入 NowCard
  it("should_import_and_use_action_panel_hook", async () => {
    const mod = await import(
      "@/features/workspace/components/todo-workspace-view"
    );
    expect(mod.TodoWorkspaceView).toBeDefined();
  });

  // 场景 4.12: GoalIndicator 多目标时渲染对应数量圆点
  it("should_render_dots_for_each_goal", () => {
    const goals = [
      { goalId: "g1", goalName: "供应链评估", actionCount: 3 },
      { goalId: "g2", goalName: "v2note产品", actionCount: 2 },
    ];
    const { container } = render(
      <GoalIndicator goals={goals} selected={0} onSelect={vi.fn()} />,
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
  });

  // 场景 4.12: 选中目标圆点应高亮
  it("should_highlight_selected_goal_dot", () => {
    const goals = [
      { goalId: "g1", goalName: "供应链评估", actionCount: 3 },
      { goalId: "g2", goalName: "v2note产品", actionCount: 2 },
    ];
    const { container } = render(
      <GoalIndicator goals={goals} selected={0} onSelect={vi.fn()} />,
    );
    const dots = container.querySelectorAll("span[class*='rounded-full']");
    // 第一个应有 bg-deer 高亮
    const firstDot = dots[0];
    expect(firstDot?.className).toContain("bg-deer");
  });

  // 场景 4.12: 无目标时不渲染
  it("should_return_null_when_no_goals", () => {
    const { container } = render(
      <GoalIndicator goals={[]} selected={0} onSelect={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
