/**
 * cognitive-wiki Phase 5 — discovery overlay 测试
 * 覆盖场景 5.1: wiki-page-based 主题卡片
 * 覆盖场景 5.2: 筛选药丸 + wikiPageId 参数
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscoveryOverlay } from "./discovery-overlay";

// Mock useTopics hook — 使用 wiki-based TopicItem 结构
const mockTopics = [
  { wikiPageId: "wp-1", title: "编程学习", recordCount: 10, activeGoals: [{ id: "g1", title: "学 Rust" }], lastActivity: "2026-03-28T10:00:00Z", hasActiveGoal: true, level: 3, parentId: null },
  { wikiPageId: "wp-2", title: "健身计划", recordCount: 6, activeGoals: [], lastActivity: "2026-03-25T10:00:00Z", hasActiveGoal: false, level: 3, parentId: null },
  { wikiPageId: "wp-3", title: "读书笔记", recordCount: 2, activeGoals: [], lastActivity: "2026-03-20T10:00:00Z", hasActiveGoal: false, level: 2, parentId: "wp-1" },
  { wikiPageId: "wp-4", title: "AI 探索", recordCount: 8, activeGoals: [{ id: "g2", title: "搭建 Agent" }], lastActivity: "2026-03-27T10:00:00Z", hasActiveGoal: true, level: 3, parentId: null },
];

vi.mock("../hooks/use-topics", () => ({
  useTopics: vi.fn(() => ({
    topics: mockTopics,
    active: mockTopics.filter(t => t.hasActiveGoal),
    independent: mockTopics.filter(t => !t.hasActiveGoal && t.recordCount < 3),
    silent: mockTopics.filter(t => !t.hasActiveGoal && t.recordCount >= 3),
    loading: false,
  })),
}));

describe("cognitive-wiki Phase 5: discovery-overlay", () => {
  const onClose = vi.fn();
  const onOpenTopic = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 5.1: 打开发现页 — 显示 wiki-based 主题
  it("should_render_wiki_based_topics_when_opened", () => {
    render(<DiscoveryOverlay onClose={onClose} onOpenTopic={onOpenTopic} />);

    expect(screen.getByText("编程学习")).toBeTruthy();
    expect(screen.getByText("健身计划")).toBeTruthy();
    expect(screen.getByText("读书笔记")).toBeTruthy();
    expect(screen.getByText("AI 探索")).toBeTruthy();
  });

  // 场景 5.1: 卡片信息展示 — 活跃目标
  it("should_show_active_goal_on_topic_card", () => {
    render(<DiscoveryOverlay onClose={onClose} onOpenTopic={onOpenTopic} />);
    expect(screen.getByText("学 Rust")).toBeTruthy();
  });

  // 场景 5.2: 点击卡片传递 wikiPageId 而非 clusterId
  it("should_pass_wikiPageId_when_card_clicked", () => {
    render(<DiscoveryOverlay onClose={onClose} onOpenTopic={onOpenTopic} />);

    fireEvent.click(screen.getByText("编程学习"));
    expect(onOpenTopic).toHaveBeenCalledWith("wp-1");
  });

  // 场景 5.1: 空状态
  it("should_show_empty_guide_when_no_wiki_pages", async () => {
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

  // 场景 5.2: 筛选药丸
  it("should_filter_topics_by_pill_with_wiki_page_data", async () => {
    const mod = await import("../hooks/use-topics");
    vi.mocked(mod.useTopics).mockReturnValue({
      topics: mockTopics,
      active: mockTopics.filter(t => t.hasActiveGoal),
      independent: mockTopics.filter(t => !t.hasActiveGoal && t.recordCount < 3),
      silent: mockTopics.filter(t => !t.hasActiveGoal && t.recordCount >= 3),
      loading: false,
    });

    render(<DiscoveryOverlay onClose={onClose} onOpenTopic={onOpenTopic} />);

    // 点击"活跃"筛选
    const pills = screen.getAllByText("活跃");
    fireEvent.click(pills[0]);

    expect(screen.getByText("编程学习")).toBeTruthy();
    expect(screen.getByText("AI 探索")).toBeTruthy();
    expect(screen.queryByText("健身计划")).toBeNull();
    expect(screen.queryByText("读书笔记")).toBeNull();
  });
});
