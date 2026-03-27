import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock reportSwipe
vi.mock("@/shared/lib/api/action-panel", () => ({
  reportSwipe: vi.fn().mockResolvedValue(undefined),
}));

import { NowCard } from "./now-card";

const baseCard = {
  strikeId: "s1",
  goalName: "供应链评估",
  action: "打给张总确认报价",
  actionType: "call",
  goalId: "g1",
  context: "需要确认铝价",
  targetPerson: "张总",
  durationEstimate: "15min",
};

type SkipReason = "wait" | "blocked" | "rethink";

describe("NowCard — 滑动露出标签", () => {
  let onComplete: (strikeId: string) => void;
  let onSkip: (strikeId: string, reason?: SkipReason) => void;
  let onReflect: (strikeId: string) => void;

  beforeEach(() => {
    onComplete = vi.fn();
    onSkip = vi.fn();
    onReflect = vi.fn();
  });

  // 场景 4.8: 渲染基本内容
  it("should_render_card_content_correctly", () => {
    render(<NowCard card={baseCard} onComplete={onComplete} onSkip={onSkip} />);
    expect(screen.getByText("供应链评估")).toBeInTheDocument();
    expect(screen.getByText("打给张总确认报价")).toBeInTheDocument();
    expect(screen.getByText("需要确认铝价")).toBeInTheDocument();
    expect(screen.getByText("→ 张总")).toBeInTheDocument();
    expect(screen.getByText("⏱ 15min")).toBeInTheDocument();
  });

  // 场景 4.8: 右滑背景层应包含森林色完成标签
  it("should_show_complete_label_in_right_swipe_background", () => {
    const { container } = render(
      <NowCard card={baseCard} onComplete={onComplete} onSkip={onSkip} />,
    );
    // 背景层总是渲染，通过 opacity 控制可见度
    const bgLayer = container.querySelector("[class*='bg-forest']");
    expect(bgLayer).toBeInTheDocument();
  });

  // 场景 4.9: 左滑背景层应包含晨光色跳过原因标签
  it("should_contain_skip_reason_labels_in_left_swipe_area", () => {
    const { container } = render(
      <NowCard card={baseCard} onComplete={onComplete} onSkip={onSkip} />,
    );
    // 跳过原因标签在 DOM 中存在（forking 时显示）
    const html = container.innerHTML;
    expect(html).toContain("等条件");
    expect(html).toContain("有阻力");
    expect(html).toContain("要重想");
  });

  // 场景 4.11: 反复跳过 ≥ 5 应显示反思提示
  it("should_show_reflection_prompt_when_skipCount_gte_5", () => {
    render(
      <NowCard
        card={{ ...baseCard, skipCount: 5 }}
        onComplete={onComplete}
        onSkip={onSkip}
        onReflect={onReflect}
      />,
    );
    expect(screen.getByText(/这件事已经在这里/)).toBeInTheDocument();
    expect(screen.getByText("和路路聊聊")).toBeInTheDocument();
  });

  // 场景 4.11: skipCount < 5 不显示反思提示
  it("should_not_show_reflection_prompt_when_skipCount_lt_5", () => {
    render(
      <NowCard
        card={{ ...baseCard, skipCount: 3 }}
        onComplete={onComplete}
        onSkip={onSkip}
        onReflect={onReflect}
      />,
    );
    expect(screen.queryByText(/这件事已经在这里/)).not.toBeInTheDocument();
  });

  // 场景 4.11: 点击反思按钮触发 onReflect
  it("should_call_onReflect_when_reflection_button_clicked", () => {
    render(
      <NowCard
        card={{ ...baseCard, skipCount: 6 }}
        onComplete={onComplete}
        onSkip={onSkip}
        onReflect={onReflect}
      />,
    );
    fireEvent.click(screen.getByText("和路路聊聊"));
    expect(vi.mocked(onReflect)).toHaveBeenCalledWith("s1");
  });

  // 场景 4.8: 右滑完成标签文本
  it("should_have_complete_checkmark_in_right_background", () => {
    const { container } = render(
      <NowCard card={baseCard} onComplete={onComplete} onSkip={onSkip} />,
    );
    // 右滑背景包含完成文案
    const bgForest = container.querySelector("[class*='bg-forest']");
    expect(bgForest?.textContent).toContain("完成");
  });

  // 场景 4.9: 左滑背景层包含晨光色
  it("should_have_dawn_colored_left_swipe_background", () => {
    const { container } = render(
      <NowCard card={baseCard} onComplete={onComplete} onSkip={onSkip} />,
    );
    const bgDawn = container.querySelector("[class*='bg-dawn']");
    expect(bgDawn).toBeInTheDocument();
  });
});
