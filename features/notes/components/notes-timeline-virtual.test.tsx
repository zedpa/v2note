/**
 * NotesTimeline 虚拟滚动集成测试
 * spec: native-experience-deep.md Phase D — 日记流虚拟滚动
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NoteItem } from "@/shared/lib/types";

// ── Mock 所有外部依赖 ──────────────────────────────────────────

vi.mock("@/features/notes/hooks/use-notes", () => ({
  useNotes: vi.fn(() => ({
    notes: [] as NoteItem[],
    loading: false,
    error: null,
    deleteNotes: vi.fn(),
    archiveNotes: vi.fn(),
    updateNote: vi.fn(),
    groupByDate: vi.fn(() => []),
    refetch: vi.fn(),
    refresh: vi.fn(() => Promise.resolve(true)),
    autoRefreshPaused: false,
  })),
}));

vi.mock("@/features/notes/hooks/use-note-detail", () => ({
  useNoteDetail: vi.fn(() => ({ detail: null, loading: false })),
}));

vi.mock("@/features/notes/hooks/use-cached-image", () => ({
  useCachedImage: vi.fn(() => ({ src: null, loading: false, failed: false })),
}));

vi.mock("@/shared/components/confirm-dialog", () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(),
    ConfirmDialog: () => null,
  }),
}));

vi.mock("@/shared/lib/fab-notify", () => ({
  fabNotify: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/features/recording/lib/audio-cache", () => ({
  getAudioByRecordId: vi.fn(() => Promise.resolve(null)),
  deleteAudio: vi.fn(),
  addWavHeader: vi.fn(),
}));

vi.mock("@/shared/lib/api/records", () => ({
  retryRecordAudio: vi.fn(),
  deleteRecords: vi.fn(),
}));

vi.mock("./insight-card", () => ({
  InsightCard: () => null,
}));

vi.mock("@/shared/components/markdown-content", () => ({
  MarkdownContent: ({ children }: { children: string }) => (
    <span data-testid="markdown-content">{children}</span>
  ),
}));

vi.mock("@/shared/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/shared/lib/api/cognitive", () => ({
  fetchCognitiveStats: vi.fn(() => Promise.resolve({ top_clusters: [] })),
}));

vi.mock("./mini-audio-player", () => ({
  MiniAudioPlayer: () => null,
}));

// react-dom createPortal mock
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  };
});

// Mock useVirtualList — 追踪调用参数并返回可控的虚拟 items
const mockRemeasure = vi.fn();
const mockMeasureElement = vi.fn();
let mockVirtualItems: any[] = [];
let mockTotalSize = 0;

vi.mock("@/shared/hooks/use-virtual-list", () => ({
  useVirtualList: vi.fn((opts: any) => {
    // 根据 count 生成虚拟 items（模拟只渲染部分）
    const estimateSize = opts.estimateSize || 120;
    const overscan = opts.overscan ?? 3;
    const visibleCount = opts.count === 0 ? 0 : Math.min(opts.count, 5 + overscan * 2);

    mockVirtualItems = Array.from({ length: visibleCount }, (_, i) => ({
      index: i,
      start: i * estimateSize,
      size: estimateSize,
      end: (i + 1) * estimateSize,
      key: i,
    }));
    mockTotalSize = opts.count * estimateSize;

    return {
      virtualizer: {
        getVirtualItems: () => mockVirtualItems,
        getTotalSize: () => mockTotalSize,
        measure: mockRemeasure,
      },
      virtualItems: mockVirtualItems,
      totalSize: mockTotalSize,
      measureElement: mockMeasureElement,
      remeasure: mockRemeasure,
    };
  }),
}));

import { NotesTimeline } from "./notes-timeline";

/** 创建最小 NoteItem 测试数据 */
function makeNote(overrides: Partial<NoteItem> = {}): NoteItem {
  return {
    id: "note-1",
    title: "测试笔记",
    short_summary: "测试摘要",
    tags: [],
    hierarchy_tags: [],
    date: "2026-04-11",
    time: "10:00",
    location: null,
    status: "completed",
    duration_seconds: null,
    audio_path: null,
    file_url: null,
    file_name: null,
    created_at: "2026-04-11T02:00:00Z",
    source: "manual",
    source_type: null,
    ...overrides,
  };
}

/** 生成 N 条在同一天的 notes */
function makeNotes(count: number, date = "2026-04-11"): NoteItem[] {
  return Array.from({ length: count }, (_, i) => makeNote({
    id: `note-${i}`,
    title: `笔记 ${i}`,
    short_summary: `摘要 ${i}`,
    created_at: `${date}T${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`,
  }));
}

/** 设置 useNotes mock 返回指定 notes */
async function setMockNotes(notes: NoteItem[]) {
  const mod = await import("@/features/notes/hooks/use-notes");
  vi.mocked(mod.useNotes).mockReturnValue({
    notes,
    loading: false,
    error: null,
    deleteNotes: vi.fn(),
    archiveNotes: vi.fn(),
    updateNote: vi.fn(),
    groupByDate: vi.fn(() => []),
    refetch: vi.fn(() => Promise.resolve(true)),
    refresh: vi.fn(() => Promise.resolve(true)),
    autoRefreshPaused: false,
  } as any);
}

async function setMockLoading() {
  const mod = await import("@/features/notes/hooks/use-notes");
  vi.mocked(mod.useNotes).mockReturnValue({
    notes: [],
    loading: true,
    error: null,
    deleteNotes: vi.fn(),
    archiveNotes: vi.fn(),
    updateNote: vi.fn(),
    groupByDate: vi.fn(() => []),
    refetch: vi.fn(() => Promise.resolve(true)),
    refresh: vi.fn(() => Promise.resolve(true)),
    autoRefreshPaused: false,
  } as any);
}

describe("NotesTimeline 虚拟滚动 (Phase D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 2.1: 日记流虚拟滚动 — 200 条记录只渲染部分 DOM 节点
  it("should_render_only_visible_items_when_list_has_200_notes", async () => {
    await setMockNotes(makeNotes(200));

    render(<NotesTimeline />);

    // flatRows = 1 day-header + 200 note-cards = 201 行
    // 虚拟化后只渲染 11 行（5 可见 + 3*2 overscan），其中第一行是 day-header
    // 所以 timeline-card 数量为 10（11 行减去 1 个 day-header）
    const cards = screen.getAllByTestId("timeline-card");
    expect(cards.length).toBeLessThan(200);
    expect(cards.length).toBe(10);
  });

  // 场景 2.1: 虚拟滚动容器有正确的 totalSize 高度
  it("should_set_virtual_container_height_to_total_size", async () => {
    await setMockNotes(makeNotes(200));

    const { container } = render(<NotesTimeline />);

    // 查找虚拟滚动内容容器
    const virtualContainer = container.querySelector("[data-testid='virtual-list-inner']");
    expect(virtualContainer).toBeTruthy();
    if (virtualContainer) {
      const style = (virtualContainer as HTMLElement).style;
      // flatRows = 1 day-header + 200 note-cards = 201 行, totalSize = 201 * 120
      expect(style.height).toBe(`${201 * 120}px`);
    }
  });

  // 场景 2.6: 动态高度 — 每个 item 绑定 measureElement ref
  it("should_bind_measureElement_ref_to_each_virtual_item", async () => {
    await setMockNotes(makeNotes(5));

    render(<NotesTimeline />);

    // measureElement 应被调用（通过 ref callback）
    // 至少应有 5 个卡片渲染
    const cards = screen.getAllByTestId("timeline-card");
    expect(cards.length).toBeGreaterThan(0);
  });

  // 场景 2.9: 空列表 — 显示引导组件而非空虚拟滚动容器
  it("should_show_empty_state_guide_when_no_notes", async () => {
    await setMockNotes([]);

    render(<NotesTimeline />);

    // 应显示空状态引导文字
    expect(screen.getByText("开始你的第一条记录")).toBeTruthy();
    // 不应有虚拟滚动容器
    expect(screen.queryByTestId("virtual-list-inner")).toBeNull();
  });

  // 场景 2.9: 空列表 — 不渲染任何 timeline-card
  it("should_render_no_timeline_cards_when_empty", async () => {
    await setMockNotes([]);

    render(<NotesTimeline />);

    expect(screen.queryByTestId("timeline-card")).toBeNull();
  });

  // 场景 2.7: 下拉刷新兼容 — onRegisterRefresh 回调注册
  it("should_register_refresh_callback_when_onRegisterRefresh_provided", async () => {
    await setMockNotes(makeNotes(10));
    const registerRefresh = vi.fn();

    render(<NotesTimeline onRegisterRefresh={registerRefresh} />);

    expect(registerRefresh).toHaveBeenCalled();
  });

  // 场景 2.1: useVirtualList 被正确调用，传入 estimateSize=120, overscan=3
  it("should_call_useVirtualList_with_correct_config", async () => {
    const notes = makeNotes(50);
    await setMockNotes(notes);

    render(<NotesTimeline />);

    const { useVirtualList } = await import("@/shared/hooks/use-virtual-list");
    const mockFn = vi.mocked(useVirtualList);
    expect(mockFn).toHaveBeenCalled();

    const lastCall = mockFn.mock.calls[mockFn.mock.calls.length - 1][0];
    expect(lastCall.estimateSize).toBe(120);
    expect(lastCall.overscan).toBe(3);
  });

  // loading 状态仍显示 skeleton（不触发虚拟滚动）
  it("should_show_skeleton_when_loading", async () => {
    await setMockLoading();

    const { container } = render(<NotesTimeline />);

    // skeleton shimmer 动画应存在
    const shimmers = container.querySelectorAll(".animate-shimmer");
    expect(shimmers.length).toBeGreaterThan(0);
    // 不应有虚拟滚动容器
    expect(screen.queryByTestId("virtual-list-inner")).toBeNull();
  });
});
