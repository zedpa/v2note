/**
 * sidebar-drawer.tsx 单元测试
 * Phase 15.2 — goal page 星标 + suggestion 角标
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarDrawer } from "./sidebar-drawer";

// 基础 props
const baseProps = {
  open: true,
  onClose: vi.fn(),
};

function makePage(overrides: Record<string, any> = {}) {
  return {
    id: "p1",
    title: "测试主题",
    level: 3,
    parentId: null,
    createdBy: "ai",
    pageType: "topic",
    recordCount: 5,
    activeGoals: [],
    updatedAt: "2026-04-12T00:00:00Z",
    ...overrides,
  };
}

describe("SidebarDrawer — Phase 15.2", () => {
  it("should_show_star_icon_when_page_type_is_goal", () => {
    const goalPage = makePage({ pageType: "goal", title: "通过四级考试" });
    render(<SidebarDrawer {...baseProps} wikiPages={[goalPage]} />);

    // goal page 应该显示星标
    expect(screen.getByText("⭐")).toBeTruthy();
    expect(screen.getByText("通过四级考试")).toBeTruthy();
  });

  it("should_not_show_star_icon_when_page_type_is_topic", () => {
    const topicPage = makePage({ pageType: "topic", title: "技术笔记" });
    render(<SidebarDrawer {...baseProps} wikiPages={[topicPage]} />);

    expect(screen.getByText("技术笔记")).toBeTruthy();
    expect(screen.queryByText("⭐")).toBeNull();
  });

  it("should_show_star_icon_for_goal_child_page", () => {
    const parentPage = makePage({ id: "parent", title: "父主题", pageType: "topic" });
    const childGoalPage = makePage({
      id: "child",
      title: "子目标",
      pageType: "goal",
      parentId: "parent",
      level: 2,
    });
    render(<SidebarDrawer {...baseProps} wikiPages={[parentPage, childGoalPage]} />);

    // 先展开父节点
    const parentButton = screen.getByText("父主题").closest("button");
    if (parentButton) fireEvent.click(parentButton);

    expect(screen.getByText("子目标")).toBeTruthy();
    // 子 goal page 也应该显示星标
    expect(screen.getAllByText("⭐").length).toBeGreaterThanOrEqual(1);
  });

  it("should_show_suggestion_badge_when_pending_count_greater_than_zero", () => {
    render(
      <SidebarDrawer {...baseProps} pendingSuggestionCount={3} />,
    );

    expect(screen.getByText("AI 建议")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("should_not_show_suggestion_badge_when_pending_count_is_zero", () => {
    render(
      <SidebarDrawer {...baseProps} pendingSuggestionCount={0} />,
    );

    expect(screen.queryByText("AI 建议")).toBeNull();
  });

  it("should_call_onOpenSuggestions_when_suggestion_badge_clicked", () => {
    const onOpenSuggestions = vi.fn();
    render(
      <SidebarDrawer
        {...baseProps}
        pendingSuggestionCount={2}
        onOpenSuggestions={onOpenSuggestions}
      />,
    );

    fireEvent.click(screen.getByText("AI 建议"));
    expect(onOpenSuggestions).toHaveBeenCalledOnce();
  });
});
