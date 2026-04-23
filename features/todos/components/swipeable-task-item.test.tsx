import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act, fireEvent } from "@testing-library/react";
import { SwipeableTaskItem } from "./swipeable-task-item";
import type { TodoDTO } from "../lib/todo-types";

// Mock haptics — 避免 Capacitor 依赖
vi.mock("@/shared/lib/haptics", () => ({
  hapticsImpactLight: vi.fn().mockResolvedValue(undefined),
  hapticsNotifySuccess: vi.fn().mockResolvedValue(undefined),
  hapticsNotifyWarning: vi.fn().mockResolvedValue(undefined),
}));

/** 创建最小 TodoDTO 测试数据 */
function makeTodo(overrides: Partial<TodoDTO> = {}): TodoDTO {
  return {
    id: "todo-1",
    text: "测试待办",
    done: false,
    record_id: null,
    created_at: "2026-04-02T10:00:00Z",
    scheduled_start: null,
    scheduled_end: null,
    estimated_minutes: null,
    priority: null,
    domain: null,
    impact: null,
    ai_actionable: false,
    ai_action_plan: null,
    level: 0,
    parent_id: null,
    status: "active",
    goal_id: null,
    subtask_count: 0,
    subtask_done_count: 0,
    goal_title: null,
    reminder_at: null,
    reminder_before: null,
    reminder_types: null,
    ...overrides,
  };
}

// ── 辅助：模拟 touch 手势 ────────────────────────────────────────

/** 创建 TouchEvent init 对象 */
function createTouchInit(x: number, y: number): TouchEventInit {
  const touch = {
    clientX: x,
    clientY: y,
    identifier: 0,
    target: document.body,
    pageX: x,
    pageY: y,
    screenX: x,
    screenY: y,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 0,
  } as Touch;
  return { touches: [touch], changedTouches: [touch] };
}

/**
 * 在元素上模拟一次完整的水平滑动手势
 * @param el 滑动目标元素
 * @param dx 水平位移（正=右滑，负=左滑）
 * @param steps 中间帧数，越多越平滑
 */
function simulateSwipe(el: HTMLElement, dx: number, steps = 5) {
  const startX = 200;
  const startY = 200;

  // touchstart
  act(() => {
    el.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true,
      ...createTouchInit(startX, startY),
    }));
  });

  // touchmove — 分多步，先超过 8px 锁定阈值
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    act(() => {
      el.dispatchEvent(new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        ...createTouchInit(startX + dx * progress, startY),
      }));
    });
  }

  // touchend
  act(() => {
    el.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true,
      ...createTouchInit(startX + dx, startY),
    }));
  });
}

describe("SwipeableTaskItem", () => {
  const defaultProps = {
    onToggle: vi.fn(),
    onPress: vi.fn(),
    onPostpone: vi.fn(),
    onRemove: vi.fn(),
    openId: null as string | null,
    onOpenChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 场景 1.11: 左滑露出操作按钮 ──────────────────────────────

  describe("场景 1.11: 左滑露出操作按钮", () => {
    it("should_expose_postpone_and_delete_buttons_when_swiped_left_beyond_60px", () => {
      const todo = makeTodo();
      const onOpenChange = vi.fn();
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} onOpenChange={onOpenChange} />,
      );

      // 找到前景卡片元素（cardRef 绑定的 div）
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      // 左滑 100px（超过 LEFT_THRESHOLD=60）
      simulateSwipe(card, -100);

      // onOpenChange 应被调用，打开该卡片
      expect(onOpenChange).toHaveBeenCalledWith("todo-1");
    });

    it("should_show_postpone_and_delete_labels_in_action_area", () => {
      const todo = makeTodo();
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} />,
      );

      // 操作区始终存在于 DOM 中
      const actionArea = container.querySelector('[data-testid="swipeable-task-item"]')!;
      expect(actionArea.textContent).toContain("推迟");
      expect(actionArea.textContent).toContain("删除");
    });

    it("should_keep_card_in_open_state_after_left_swipe_release", () => {
      const todo = makeTodo();
      const onOpenChange = vi.fn();
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} onOpenChange={onOpenChange} />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      simulateSwipe(card, -100);

      // 应该调用 onOpenChange 打开卡片，不应调用 null 关闭
      expect(onOpenChange).toHaveBeenCalledWith("todo-1");
      // 最后一次调用不应是关闭
      const lastCall = onOpenChange.mock.calls[onOpenChange.mock.calls.length - 1];
      expect(lastCall[0]).toBe("todo-1");
    });
  });

  // ── 场景 1.12: 左滑推迟操作 ────────────────────────────────────

  describe("场景 1.12: 左滑推迟操作", () => {
    it("should_call_onPostpone_when_postpone_button_clicked", () => {
      const todo = makeTodo({ id: "todo-postpone" });
      const onPostpone = vi.fn();
      const { container } = render(
        <SwipeableTaskItem
          todo={todo}
          {...defaultProps}
          onPostpone={onPostpone}
        />,
      );

      // 点击推迟按钮
      const buttons = container.querySelectorAll("button");
      // 推迟按钮包含 "推迟" 文字
      const postponeBtn = Array.from(buttons).find(
        (b) => b.textContent?.includes("推迟"),
      );
      expect(postponeBtn).toBeTruthy();

      act(() => {
        fireEvent.click(postponeBtn!);
      });

      expect(onPostpone).toHaveBeenCalledWith("todo-postpone");
    });
  });

  // ── 场景 1.13: 右滑快速完成 ────────────────────────────────────

  describe("场景 1.13: 右滑快速完成 + 触觉反馈", () => {
    it("should_call_onToggle_when_swiped_right_beyond_80px", async () => {
      const todo = makeTodo({ id: "todo-complete" });
      const onToggle = vi.fn();
      const { container } = render(
        <SwipeableTaskItem
          todo={todo}
          {...defaultProps}
          onToggle={onToggle}
        />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      // 右滑 100px（超过 RIGHT_THRESHOLD=80）
      simulateSwipe(card, 100);

      expect(onToggle).toHaveBeenCalledWith("todo-complete");
    });

    it("should_show_green_completion_area_with_check_icon", () => {
      const todo = makeTodo();
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} />,
      );

      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      // 第一个子 div 是右滑完成底层（绿色）
      const greenArea = wrapper.firstElementChild as HTMLElement;
      expect(greenArea.className).toContain("bg-emerald");
      expect(greenArea.textContent).toContain("完成");
    });

    it("should_trigger_haptics_when_crossing_threshold", async () => {
      const { hapticsImpactLight } = await import("@/shared/lib/haptics");
      const todo = makeTodo();
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      // 右滑超过阈值
      simulateSwipe(card, 100, 10);

      expect(hapticsImpactLight).toHaveBeenCalled();
    });

    it("should_trigger_success_haptics_on_complete", async () => {
      const { hapticsNotifySuccess } = await import("@/shared/lib/haptics");
      const todo = makeTodo();
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      simulateSwipe(card, 100);

      expect(hapticsNotifySuccess).toHaveBeenCalled();
    });
  });

  // ── 场景 1.14: 互斥 — 同一时刻只能一个卡片打开 ─────────────────

  describe("场景 1.14: 同一时刻只能一个卡片打开", () => {
    it("should_close_when_another_card_opens", () => {
      const todo = makeTodo({ id: "todo-A" });
      const { container, rerender } = render(
        <SwipeableTaskItem
          todo={todo}
          {...defaultProps}
          openId="todo-A"
        />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      // 先左滑打开自己
      simulateSwipe(card, -100);

      // 另一个卡片打开 → openId 变为 "todo-B"
      rerender(
        <SwipeableTaskItem
          todo={todo}
          {...defaultProps}
          openId="todo-B"
        />,
      );

      // 自己应该回弹到 0
      expect(card.style.transform).toContain("translateX(0px)");
    });
  });

  // ── 场景 1.15: 已完成待办不支持右滑 ────────────────────────────

  describe("场景 1.15: 已完成待办不支持右滑", () => {
    it("should_not_trigger_complete_when_done_todo_swiped_right", () => {
      const todo = makeTodo({ done: true });
      const onToggle = vi.fn();
      const { container } = render(
        <SwipeableTaskItem
          todo={todo}
          {...defaultProps}
          onToggle={onToggle}
        />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      // 右滑 100px — 不应触发完成
      simulateSwipe(card, 100);

      expect(onToggle).not.toHaveBeenCalled();
    });

    it("should_still_allow_left_swipe_for_done_todo", () => {
      const todo = makeTodo({ done: true });
      const onOpenChange = vi.fn();
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} onOpenChange={onOpenChange} />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      // 左滑应该仍然生效
      simulateSwipe(card, -100);

      // 对于已完成待办，左滑仍可用（可删除）
      expect(onOpenChange).toHaveBeenCalledWith("todo-1");
    });
  });

  // ── 边界条件: 滑动距离不足 ─────────────────────────────────────

  describe("滑动距离不足阈值", () => {
    it("should_snap_back_when_swipe_right_less_than_80px", () => {
      const todo = makeTodo();
      const onToggle = vi.fn();
      const { container } = render(
        <SwipeableTaskItem
          todo={todo}
          {...defaultProps}
          onToggle={onToggle}
        />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      // 右滑仅 50px（不足 80px 阈值）
      simulateSwipe(card, 50);

      // 不应触发完成
      expect(onToggle).not.toHaveBeenCalled();
      // 应回弹到 0
      expect(card.style.transform).toContain("translateX(0px)");
    });

    it("should_snap_back_when_swipe_left_less_than_60px", () => {
      const todo = makeTodo();
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      // 左滑仅 40px（不足 60px 阈值）
      simulateSwipe(card, -40);

      // 应回弹到 0
      expect(card.style.transform).toContain("translateX(0px)");
      // 不应打开
      expect(defaultProps.onOpenChange).not.toHaveBeenCalledWith("todo-1");
    });
  });

  // ── 边界条件: 纵向滚动不干扰 ──────────────────────────────────

  describe("垂直滚动不触发滑动", () => {
    it("should_not_enter_swipe_mode_when_vertical_movement_dominates", () => {
      const todo = makeTodo();
      const onToggle = vi.fn();
      const { container } = render(
        <SwipeableTaskItem
          todo={todo}
          {...defaultProps}
          onToggle={onToggle}
        />,
      );
      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      const card = wrapper.lastElementChild as HTMLElement;

      // 垂直滑动（dy >> dx）
      act(() => {
        card.dispatchEvent(new TouchEvent("touchstart", {
          bubbles: true,
          ...createTouchInit(200, 200),
        }));
      });
      act(() => {
        card.dispatchEvent(new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          ...createTouchInit(205, 300), // dx=5, dy=100 → 锁定为垂直
        }));
      });
      act(() => {
        card.dispatchEvent(new TouchEvent("touchend", {
          bubbles: true,
          ...createTouchInit(205, 300),
        }));
      });

      // 不应触发任何操作
      expect(onToggle).not.toHaveBeenCalled();
      expect(defaultProps.onOpenChange).not.toHaveBeenCalled();
    });
  });

  // ── 删除操作 ──────────────────────────────────────────────────

  describe("删除操作", () => {
    it("should_call_onRemove_when_delete_button_clicked", () => {
      const todo = makeTodo({ id: "todo-del" });
      const onRemove = vi.fn();
      const { container } = render(
        <SwipeableTaskItem
          todo={todo}
          {...defaultProps}
          onRemove={onRemove}
        />,
      );

      const buttons = container.querySelectorAll("button");
      const deleteBtn = Array.from(buttons).find(
        (b) => b.textContent?.includes("删除"),
      );
      expect(deleteBtn).toBeTruthy();

      act(() => {
        fireEvent.click(deleteBtn!);
      });

      expect(onRemove).toHaveBeenCalledWith("todo-del");
    });

    it("should_trigger_warning_haptics_on_delete", async () => {
      const { hapticsNotifyWarning } = await import("@/shared/lib/haptics");
      const todo = makeTodo({ id: "todo-del-haptic" });
      const onRemove = vi.fn();
      const { container } = render(
        <SwipeableTaskItem
          todo={todo}
          {...defaultProps}
          onRemove={onRemove}
        />,
      );

      const buttons = container.querySelectorAll("button");
      const deleteBtn = Array.from(buttons).find(
        (b) => b.textContent?.includes("删除"),
      );

      act(() => {
        fireEvent.click(deleteBtn!);
      });

      expect(hapticsNotifyWarning).toHaveBeenCalled();
    });
  });

  // ── 渲染基础 ──────────────────────────────────────────────────

  describe("渲染", () => {
    it("should_render_task_item_content_inside_swipeable_wrapper", () => {
      const todo = makeTodo({ text: "买牛奶" });
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} />,
      );

      expect(container.textContent).toContain("买牛奶");
      expect(container.querySelector('[data-testid="swipeable-task-item"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="task-item"]')).toBeTruthy();
    });

    it("should_render_with_overflow_hidden_on_container", () => {
      const todo = makeTodo();
      const { container } = render(
        <SwipeableTaskItem todo={todo} {...defaultProps} />,
      );

      const wrapper = container.querySelector('[data-testid="swipeable-task-item"]')!;
      expect(wrapper.className).toContain("overflow-hidden");
    });
  });
});
