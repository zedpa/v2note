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

    // goal page 在「目标」区（默认折叠），展开后显示星标
    const goalSectionHeader = screen.getByTestId("sidebar-goal-section").querySelector("button");
    if (goalSectionHeader) fireEvent.click(goalSectionHeader);

    expect(screen.getByText("通过四级考试")).toBeTruthy();
    expect(screen.getByTestId("goal-star-icon")).toBeTruthy();
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

describe("SidebarDrawer — Phase 5 侧边栏显示优化", () => {
  // 场景 5.1: Topic/Goal 分区
  describe("场景 5.1: Topic 和 Goal 视觉分区", () => {
    it("should_show_topic_pages_in_topic_section", () => {
      const pages = [
        makePage({ id: "t1", title: "工作", pageType: "topic" }),
        makePage({ id: "t2", title: "学习", pageType: "topic" }),
      ];
      render(<SidebarDrawer {...baseProps} wikiPages={pages} />);

      const topicSection = screen.getByTestId("sidebar-topic-section");
      expect(topicSection).toBeTruthy();
      expect(topicSection.textContent).toContain("工作");
      expect(topicSection.textContent).toContain("学习");
    });

    it("should_show_orphan_goal_pages_in_goal_section", () => {
      const pages = [
        makePage({ id: "t1", title: "工作", pageType: "topic" }),
        makePage({ id: "g1", title: "学英语", pageType: "goal", parentId: null }),
      ];
      render(<SidebarDrawer {...baseProps} wikiPages={pages} />);

      const goalSection = screen.getByTestId("sidebar-goal-section");
      expect(goalSection).toBeTruthy();

      // 展开目标区
      const goalSectionHeader = goalSection.querySelector("button");
      if (goalSectionHeader) fireEvent.click(goalSectionHeader);

      expect(goalSection.textContent).toContain("学英语");
      // goal 不应出现在 topic section
      const topicSection = screen.getByTestId("sidebar-topic-section");
      expect(topicSection.textContent).not.toContain("学英语");
    });

    it("should_show_goal_under_parent_topic_not_in_goal_section_when_has_parentId", () => {
      const pages = [
        makePage({ id: "t1", title: "工作", pageType: "topic" }),
        makePage({ id: "g1", title: "Q2 业绩", pageType: "goal", parentId: "t1", level: 2 }),
      ];
      render(<SidebarDrawer {...baseProps} wikiPages={pages} />);

      // 挂载到 topic 的 goal 不出现在「目标」区
      expect(screen.queryByTestId("sidebar-goal-section")).toBeNull();
    });

    it("should_hide_goal_section_when_no_orphan_goals", () => {
      const pages = [
        makePage({ id: "t1", title: "工作", pageType: "topic" }),
      ];
      render(<SidebarDrawer {...baseProps} wikiPages={pages} />);

      expect(screen.queryByTestId("sidebar-goal-section")).toBeNull();
    });

    it("should_show_goal_count_badge_in_goal_section_header", () => {
      const pages = [
        makePage({ id: "g1", title: "学英语", pageType: "goal" }),
        makePage({ id: "g2", title: "减肥", pageType: "goal" }),
      ];
      render(<SidebarDrawer {...baseProps} wikiPages={pages} />);

      const goalSection = screen.getByTestId("sidebar-goal-section");
      // 应该显示数量 badge "2"
      expect(goalSection.textContent).toContain("2");
    });

    it("should_default_collapse_goal_section", () => {
      const pages = [
        makePage({ id: "g1", title: "学英语", pageType: "goal" }),
      ];
      render(<SidebarDrawer {...baseProps} wikiPages={pages} />);

      // 「目标」区默认折叠，不显示 goal 内容
      const goalSection = screen.getByTestId("sidebar-goal-section");
      expect(goalSection.textContent).not.toContain("学英语");
    });
  });

  // 场景 5.2: 空 page 视觉弱化
  describe("场景 5.2: 空 page 视觉弱化", () => {
    it("should_dim_empty_page_with_opacity", () => {
      const emptyPage = makePage({ id: "e1", title: "空主题", recordCount: 0 });
      render(<SidebarDrawer {...baseProps} wikiPages={[emptyPage]} />);

      const item = screen.getByTestId("sidebar-page-item-e1");
      expect(item.style.opacity).toBe("0.5");
    });

    it("should_not_dim_page_with_records", () => {
      const page = makePage({ id: "p1", title: "有内容", recordCount: 5 });
      render(<SidebarDrawer {...baseProps} wikiPages={[page]} />);

      const item = screen.getByTestId("sidebar-page-item-p1");
      expect(item.style.opacity).not.toBe("0.5");
    });

    it("should_not_show_record_count_badge_when_zero", () => {
      const emptyPage = makePage({ id: "e1", title: "空主题", recordCount: 0 });
      render(<SidebarDrawer {...baseProps} wikiPages={[emptyPage]} />);

      // 不应该显示 "0"
      const item = screen.getByTestId("sidebar-page-item-e1");
      // recordCount badge 不存在或为空
      const badges = item.querySelectorAll(".font-mono");
      for (const badge of badges) {
        expect(badge.textContent).not.toBe("0");
      }
    });

    it("should_show_archive_option_in_context_menu_for_empty_page", () => {
      const onDeletePage = vi.fn();
      const emptyPage = makePage({ id: "e1", title: "空主题", recordCount: 0 });
      render(<SidebarDrawer {...baseProps} wikiPages={[emptyPage]} onDeletePage={onDeletePage} />);

      // 打开上下文菜单（右键）
      const item = screen.getByText("空主题");
      fireEvent.contextMenu(item);

      // 应该有「归档」选项
      expect(screen.getByText("归档")).toBeTruthy();
    });

    it("should_call_onDeletePage_without_confirmation_when_archive_clicked", () => {
      const onDeletePage = vi.fn();
      const emptyPage = makePage({ id: "e1", title: "空主题", recordCount: 0 });
      render(<SidebarDrawer {...baseProps} wikiPages={[emptyPage]} onDeletePage={onDeletePage} />);

      // 打开上下文菜单
      const item = screen.getByText("空主题");
      fireEvent.contextMenu(item);

      // 点击归档
      fireEvent.click(screen.getByText("归档"));

      // 应直接调用 onDeletePage，不弹确认框
      expect(onDeletePage).toHaveBeenCalledWith("e1", 0);
    });
  });

  // 场景 5.3: Goal page 在 topic 子树中显示
  describe("场景 5.3: Goal page 在 topic 子树中的显示", () => {
    it("should_show_star_icon_for_goal_in_topic_subtree", () => {
      const pages = [
        makePage({ id: "t1", title: "工作", pageType: "topic" }),
        makePage({ id: "g1", title: "Q2 业绩目标", pageType: "goal", parentId: "t1", level: 2 }),
      ];
      render(<SidebarDrawer {...baseProps} wikiPages={pages} />);

      // 展开 "工作"
      fireEvent.click(screen.getByText("工作").closest("button")!);

      // Q2 业绩目标 应该有星标图标
      expect(screen.getByTestId("goal-star-icon")).toBeTruthy();
      expect(screen.getByText("Q2 业绩目标")).toBeTruthy();
    });

    it("should_add_data_page_type_attribute_to_page_items", () => {
      const pages = [
        makePage({ id: "t1", title: "工作", pageType: "topic" }),
        makePage({ id: "g1", title: "目标A", pageType: "goal" }),
      ];
      render(<SidebarDrawer {...baseProps} wikiPages={pages} />);

      const topicItem = screen.getByTestId("sidebar-page-item-t1");
      expect(topicItem.getAttribute("data-page-type")).toBe("topic");

      // 展开目标区
      const goalHeader = screen.getByTestId("sidebar-goal-section").querySelector("button");
      if (goalHeader) fireEvent.click(goalHeader);

      const goalItem = screen.getByTestId("sidebar-page-item-g1");
      expect(goalItem.getAttribute("data-page-type")).toBe("goal");
    });
  });
});
