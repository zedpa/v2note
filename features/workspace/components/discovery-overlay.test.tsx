/**
 * discovery-page spec 测试
 * 覆盖场景 1-4, 6: 打开发现页、卡片展示、空状态、筛选药丸
 * 场景 3 (生命周期) 由 topic-lifecycle-view 已有组件覆盖
 * 场景 5 (跳转) 为 overlay 导航，由 page.tsx 集成覆盖
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscoveryOverlay } from "./discovery-overlay";

// Mock useTopics hook
const mockTopics = [
  { clusterId: "c1", title: "编程学习", memberCount: 10, activeGoals: [{ id: "g1", title: "学 Rust" }], lastActivity: "2026-03-28T10:00:00Z", intendDensity: 5, hasActiveGoal: true },
  { clusterId: "c2", title: "健身计划", memberCount: 6, activeGoals: [], lastActivity: "2026-03-25T10:00:00Z", intendDensity: 3, hasActiveGoal: false },
  { clusterId: "c3", title: "读书笔记", memberCount: 2, activeGoals: [], lastActivity: "2026-03-20T10:00:00Z", intendDensity: 1, hasActiveGoal: false },
  { clusterId: "c4", title: "AI 探索", memberCount: 8, activeGoals: [{ id: "g2", title: "搭建 Agent" }], lastActivity: "2026-03-27T10:00:00Z", intendDensity: 4, hasActiveGoal: true },
];

vi.mock("../hooks/use-topics", () => ({
  useTopics: vi.fn(() => ({
    topics: mockTopics,
    active: mockTopics.filter(t => t.hasActiveGoal),
    independent: mockTopics.filter(t => !t.hasActiveGoal && t.memberCount < 3),
    silent: mockTopics.filter(t => !t.hasActiveGoal && t.memberCount >= 3),
    loading: false,
  })),
}));

describe("discovery-overlay", () => {
  const onClose = vi.fn();
  const onOpenTopic = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1: 打开发现页 — 按类别分组展示
  it("should_render_topics_grouped_by_category_when_opened", () => {
    render(<DiscoveryOverlay onClose={onClose} onOpenTopic={onOpenTopic} />);

    // 应显示所有主题标题
    expect(screen.getByText("编程学习")).toBeTruthy();
    expect(screen.getByText("健身计划")).toBeTruthy();
    expect(screen.getByText("读书笔记")).toBeTruthy();
    expect(screen.getByText("AI 探索")).toBeTruthy();
  });

  // 场景 2: 卡片信息展示
  it("should_show_topic_card_with_title_and_activity_info", () => {
    render(<DiscoveryOverlay onClose={onClose} onOpenTopic={onOpenTopic} />);

    // 活跃主题应显示目标信息
    expect(screen.getByText("学 Rust")).toBeTruthy();
  });

  // 场景 2: 点击卡片进入详情
  it("should_call_onOpenTopic_when_card_clicked", () => {
    render(<DiscoveryOverlay onClose={onClose} onOpenTopic={onOpenTopic} />);

    fireEvent.click(screen.getByText("编程学习"));
    expect(onOpenTopic).toHaveBeenCalledWith("c1");
  });

  // 场景 4: 空状态
  it("should_show_empty_guide_when_no_topics", async () => {
    const { useTopics } = await import("../hooks/use-topics");
    vi.mocked(useTopics).mockReturnValue({
      topics: [],
      active: [],
      independent: [],
      silent: [],
      loading: false,
    });

    render(<DiscoveryOverlay onClose={onClose} onOpenTopic={onOpenTopic} />);

    expect(screen.getByText(/继续记录/)).toBeTruthy();
  });

  // 场景 6: 筛选药丸 — 全部 / 活跃 / 静默 / 种子
  it("should_filter_topics_when_pill_clicked", async () => {
    const mod = await import("../hooks/use-topics");
    vi.mocked(mod.useTopics).mockReturnValue({
      topics: mockTopics,
      active: mockTopics.filter(t => t.hasActiveGoal),
      independent: mockTopics.filter(t => !t.hasActiveGoal && t.memberCount < 3),
      silent: mockTopics.filter(t => !t.hasActiveGoal && t.memberCount >= 3),
      loading: false,
    });

    render(<DiscoveryOverlay onClose={onClose} onOpenTopic={onOpenTopic} />);

    // 点击"活跃"筛选药丸（药丸在 header 区，有特定样式）
    const pills = screen.getAllByText("活跃");
    // 第一个匹配是筛选药丸按钮
    const activePill = pills[0];
    fireEvent.click(activePill);

    // 只显示活跃主题
    expect(screen.getByText("编程学习")).toBeTruthy();
    expect(screen.getByText("AI 探索")).toBeTruthy();
    expect(screen.queryByText("健身计划")).toBeNull();
    expect(screen.queryByText("读书笔记")).toBeNull();
  });
});
