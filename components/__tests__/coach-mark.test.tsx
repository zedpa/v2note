/**
 * CoachMark 通用聚焦引导组件 — 单元测试
 * spec: fix-onboarding-step2-guide
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

// 模拟目标元素：创建 DOM 元素并 mock getBoundingClientRect
function mockElement(selector: string, rect: DOMRect) {
  const el = document.createElement("div");
  // 从 "[data-guide='fab']" 提取 "fab"
  const match = selector.match(/data-guide='([^']+)'/);
  if (match) el.setAttribute("data-guide", match[1]);
  el.getBoundingClientRect = () => rect;
  document.body.appendChild(el);
  return el;
}

const defaultRect = {
  top: 100,
  left: 50,
  width: 60,
  height: 60,
  bottom: 160,
  right: 110,
  x: 50,
  y: 100,
  toJSON: () => {},
} as DOMRect;

describe("CoachMark 聚焦引导组件", () => {
  let elements: HTMLElement[] = [];

  beforeEach(() => {
    elements = [];
  });

  afterEach(() => {
    elements.forEach((el) => el.remove());
    elements = [];
  });

  it("should_show_overlay_and_first_step_message_when_rendered", async () => {
    elements.push(mockElement("[data-guide='fab']", defaultRect));
    elements.push(mockElement("[data-guide='tab-todo']", defaultRect));

    const { CoachMark } = await import("../coach-mark");
    const onComplete = vi.fn();

    await act(async () => {
      render(
        <CoachMark
          steps={[
            { target: "[data-guide='fab']", message: "按住说话", placement: "top" },
            { target: "[data-guide='tab-todo']", message: "试试语音指令", placement: "bottom" },
          ]}
          onComplete={onComplete}
        />,
      );
    });

    // 遮罩出现
    expect(screen.getByTestId("coach-mark-overlay")).toBeTruthy();
    // 第一步文案
    expect(screen.getByTestId("coach-mark-message").textContent).toContain("按住说话");
  });

  it("should_advance_to_next_step_when_overlay_clicked", async () => {
    elements.push(mockElement("[data-guide='fab']", defaultRect));
    elements.push(mockElement("[data-guide='tab-todo']", defaultRect));

    const { CoachMark } = await import("../coach-mark");
    const onComplete = vi.fn();

    await act(async () => {
      render(
        <CoachMark
          steps={[
            { target: "[data-guide='fab']", message: "按住说话", placement: "top" },
            { target: "[data-guide='tab-todo']", message: "试试语音指令", placement: "bottom" },
          ]}
          onComplete={onComplete}
        />,
      );
    });

    // 点击遮罩 → 前进到第二步
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-mark-overlay"));
    });

    expect(screen.getByTestId("coach-mark-message").textContent).toContain("试试语音指令");
  });

  it("should_call_onComplete_when_last_step_clicked", async () => {
    elements.push(mockElement("[data-guide='fab']", defaultRect));

    const { CoachMark } = await import("../coach-mark");
    const onComplete = vi.fn();

    await act(async () => {
      render(
        <CoachMark
          steps={[
            { target: "[data-guide='fab']", message: "按住说话", placement: "top" },
          ]}
          onComplete={onComplete}
        />,
      );
    });

    // 点击最后一步
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-mark-overlay"));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("should_skip_step_when_target_element_not_found", async () => {
    // 只创建 tab-todo，不创建 nonexistent 的目标
    elements.push(mockElement("[data-guide='tab-todo']", defaultRect));

    vi.useFakeTimers();

    const { CoachMark } = await import("../coach-mark");
    const onComplete = vi.fn();

    await act(async () => {
      render(
        <CoachMark
          steps={[
            { target: "[data-guide='nonexistent']", message: "不存在的元素", placement: "top" },
            { target: "[data-guide='tab-todo']", message: "待办标签", placement: "bottom" },
          ]}
          onComplete={onComplete}
        />,
      );
    });

    // 重试 3 次（每次 500ms）后跳过
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
    }

    // 应该跳到第二步
    expect(screen.getByTestId("coach-mark-message").textContent).toContain("待办标签");

    vi.useRealTimers();
  });

  it("should_call_onComplete_when_all_steps_have_no_target", async () => {
    // 不创建任何目标元素
    vi.useFakeTimers();

    const { CoachMark } = await import("../coach-mark");
    const onComplete = vi.fn();

    await act(async () => {
      render(
        <CoachMark
          steps={[
            { target: "[data-guide='missing1']", message: "不存在1", placement: "top" },
          ]}
          onComplete={onComplete}
        />,
      );
    });

    // 等待重试 3 次后自动跳过并完成
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
    }

    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
