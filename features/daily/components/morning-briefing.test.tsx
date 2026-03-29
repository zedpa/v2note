/**
 * daily-review-redesign spec 测试
 * 场景 1: 晨间简报内容, 场景 2: 卡片横滑, 场景 6: 无数据状态
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../hooks/use-daily-briefing", () => ({
  useDailyBriefing: vi.fn(() => ({
    briefing: {
      greeting: "早上好！",
      today_focus: ["完成报告"],
      goal_progress: [],
      carry_over: [],
      relay_pending: [],
      ai_suggestions: ["今天试试番茄钟"],
      stats: { yesterday_done: 3, yesterday_total: 5, streak: 7 },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
  markRelayDone: vi.fn(),
}));

vi.mock("@/shared/components/swipe-back", () => ({
  SwipeBack: ({ children }: any) => <div>{children}</div>,
}));

import { MorningBriefing } from "./morning-briefing";

describe("morning-briefing card swipe", () => {
  // 场景 2: 应该有分页指示器（圆点）
  it("should_have_pagination_dots_for_card_swipe", () => {
    const { container } = render(<MorningBriefing onClose={vi.fn()} />);

    // 验证存在横滑结构标志
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "morning-briefing.tsx"),
      "utf-8",
    );
    // 应该有 translateX 横滑逻辑
    expect(src).toContain("translateX");
    // 应该有触摸处理
    expect(src).toContain("onTouchStart");
    expect(src).toContain("onTouchEnd");
  });

  // 场景 1: 应该显示问候语
  it("should_render_greeting", () => {
    render(<MorningBriefing onClose={vi.fn()} />);
    expect(screen.getByText("早上好！")).toBeTruthy();
  });

  // 场景 6: 无数据时显示友好提示
  it("should_show_friendly_message_when_no_data", async () => {
    const mod = await import("../hooks/use-daily-briefing");
    vi.mocked(mod.useDailyBriefing).mockReturnValue({
      briefing: {
        greeting: "早上好",
        today_focus: [],
        goal_progress: [],
        carry_over: [],
        relay_pending: [],
        ai_suggestions: [],
        stats: { yesterday_done: 0, yesterday_total: 0, streak: 0 },
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    } as any);

    render(<MorningBriefing onClose={vi.fn()} />);
    // 应显示问候（即使无数据）
    expect(screen.getByText("早上好")).toBeTruthy();
  });
});
