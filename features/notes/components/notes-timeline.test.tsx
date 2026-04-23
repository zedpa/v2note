/**
 * regression: fix-image-thumbnail
 * 图片缩略图渲染测试 — 验证图片卡片布局和降级行为
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
  })),
}));

vi.mock("@/features/notes/hooks/use-note-detail", () => ({
  useNoteDetail: vi.fn(() => ({ detail: null, loading: false })),
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
  MarkdownContent: ({ children }: { children: string }) => <span data-testid="markdown-content">{children}</span>,
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

// useCachedImage — 回归测试需要返回 file_url 作为 src，模拟缓存命中
vi.mock("@/features/notes/hooks/use-cached-image", () => ({
  useCachedImage: vi.fn((_recordId: string | null, fileUrl: string | null) => ({
    src: fileUrl,
    loading: false,
    failed: false,
  })),
}));

// useVirtualList mock — 透传所有 items（不做虚拟化裁剪），让回归测试能看到全部渲染内容
vi.mock("@/shared/hooks/use-virtual-list", () => ({
  useVirtualList: vi.fn((opts: any) => {
    const estimateSize = opts.estimateSize || 120;
    const items = Array.from({ length: opts.count }, (_, i) => ({
      index: i,
      start: i * estimateSize,
      size: estimateSize,
      end: (i + 1) * estimateSize,
      key: i,
    }));
    return {
      virtualizer: { getVirtualItems: () => items, getTotalSize: () => opts.count * estimateSize, measure: vi.fn() },
      virtualItems: items,
      totalSize: opts.count * estimateSize,
      measureElement: vi.fn(),
      remeasure: vi.fn(),
    };
  }),
}));

// react-dom createPortal mock — 直接渲染 children
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  };
});

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

describe("regression: fix-image-thumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1: source: "image" + file_url 存在 → 渲染缩略图
  it("should_render_thumbnail_when_source_is_image_and_file_url_exists", async () => {
    await setMockNotes([
      makeNote({
        id: "img-1",
        source: "image",
        file_url: "data:image/jpeg;base64,/9j/4AAQ",
        title: "图片",
        short_summary: "一张风景照",
      }),
    ]);

    render(<NotesTimeline />);

    const thumbnail = screen.getByTestId("image-thumbnail");
    expect(thumbnail).toBeTruthy();
    expect(thumbnail.getAttribute("src")).toBe("data:image/jpeg;base64,/9j/4AAQ");
  });

  // 场景 2: source: "manual" + file_url 为 data URL → 仍渲染缩略图（历史兼容）
  it("should_render_thumbnail_when_source_is_manual_but_file_url_is_data_url", async () => {
    await setMockNotes([
      makeNote({
        id: "img-legacy",
        source: "manual",
        file_url: "data:image/png;base64,iVBORw0KGgo",
        title: "旧图片",
        short_summary: "旧数据",
      }),
    ]);

    render(<NotesTimeline />);

    const thumbnail = screen.getByTestId("image-thumbnail");
    expect(thumbnail).toBeTruthy();
  });

  // 场景 3: 图片卡片文字在前、缩略图在后（DOM 顺序）
  it("should_render_text_summary_before_thumbnail_in_dom_order", async () => {
    await setMockNotes([
      makeNote({
        id: "img-order",
        source: "image",
        file_url: "data:image/jpeg;base64,abc",
        title: "图片",
        short_summary: "AI 描述文字",
      }),
    ]);

    render(<NotesTimeline />);

    const markdownContent = screen.getByTestId("markdown-content");
    const thumbnail = screen.getByTestId("image-thumbnail");

    // 文字应在缩略图之前（compareDocumentPosition 返回 DOCUMENT_POSITION_FOLLOWING=4 表示 thumbnail 在 markdownContent 之后）
    const position = markdownContent.compareDocumentPosition(thumbnail);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // 场景 4: isImage && !short_summary → 不显示文字摘要
  it("should_not_render_text_summary_when_image_has_no_short_summary", async () => {
    await setMockNotes([
      makeNote({
        id: "img-no-summary",
        source: "image",
        file_url: "data:image/jpeg;base64,abc",
        title: "图片",
        short_summary: "",
      }),
    ]);

    render(<NotesTimeline />);

    // 缩略图应存在
    expect(screen.getByTestId("image-thumbnail")).toBeTruthy();
    // 不应渲染 markdown-content（文字摘要区域）
    expect(screen.queryByTestId("markdown-content")).toBeNull();
  });

  // 场景 5: isImage && short_summary 有值 → 缩略图 + 文字都显示
  it("should_render_both_thumbnail_and_text_when_image_has_short_summary", async () => {
    await setMockNotes([
      makeNote({
        id: "img-with-summary",
        source: "image",
        file_url: "data:image/jpeg;base64,xyz",
        title: "图片标题",
        short_summary: "这是一张风景照片",
      }),
    ]);

    render(<NotesTimeline />);

    expect(screen.getByTestId("image-thumbnail")).toBeTruthy();
    expect(screen.getByText("这是一张风景照片")).toBeTruthy();
  });
});
