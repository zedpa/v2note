/**
 * morning-briefing 简化版测试
 * 验证问候、今日重点、遗留事项、统计展示
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../hooks/use-daily-briefing", () => ({
  useDailyBriefing: vi.fn(() => ({
    briefing: {
      greeting: "早上好！",
      today_focus: ["完成报告"],
      carry_over: ["报价确认"],
      stats: { yesterday_done: 3, yesterday_total: 5 },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock("@/shared/components/swipe-back", () => ({
  SwipeBack: ({ children }: any) => <div>{children}</div>,
}));

import { MorningBriefing } from "./morning-briefing";

describe("morning-briefing 简化版", () => {
  it("should_render_greeting", () => {
    render(<MorningBriefing onClose={vi.fn()} />);
    expect(screen.getByText("早上好！")).toBeTruthy();
  });

  it("should_render_today_focus", () => {
    render(<MorningBriefing onClose={vi.fn()} />);
    expect(screen.getByText("完成报告")).toBeTruthy();
  });

  it("should_render_carry_over", () => {
    render(<MorningBriefing onClose={vi.fn()} />);
    expect(screen.getByText("报价确认")).toBeTruthy();
  });

  it("should_render_stats", () => {
    render(<MorningBriefing onClose={vi.fn()} />);
    expect(screen.getByText("3/5 完成")).toBeTruthy();
  });

  it("should_show_greeting_when_no_data", async () => {
    const mod = await import("../hooks/use-daily-briefing");
    vi.mocked(mod.useDailyBriefing).mockReturnValue({
      briefing: {
        greeting: "早上好",
        today_focus: [],
        carry_over: [],
        stats: { yesterday_done: 0, yesterday_total: 0 },
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    } as any);

    render(<MorningBriefing onClose={vi.fn()} />);
    expect(screen.getByText("早上好")).toBeTruthy();
  });
});
