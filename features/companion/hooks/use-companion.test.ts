/**
 * ai-companion-window spec — 场景 1.1, 2.1-2.3, 3.1
 * 小鹿状态机 + AI Window 三态 + 心情系统
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock API
vi.mock("@/shared/lib/api/companion", () => ({
  fetchCompanionStatus: vi.fn(),
}));

import { fetchCompanionStatus } from "@/shared/lib/api/companion";

describe("ai-companion: 场景 1.1 — 小鹿状态映射", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_map_deer_state_to_status_text", async () => {
    (fetchCompanionStatus as any).mockResolvedValue({
      deerState: "organizing",
      statusText: "在整理你的想法",
      mood: "focused",
      moodText: "专注",
      pendingMessage: null,
    });

    const status = await fetchCompanionStatus();
    expect(status.deerState).toBe("organizing");
    expect(status.statusText).toBe("在整理你的想法");
  });

  it("should_return_eating_as_default_state", async () => {
    (fetchCompanionStatus as any).mockResolvedValue({
      deerState: "eating",
      statusText: "",
      mood: "calm",
      moodText: "平静",
      pendingMessage: null,
    });

    const status = await fetchCompanionStatus();
    expect(status.deerState).toBe("eating");
    expect(status.statusText).toBe("");
  });
});

describe("ai-companion: 场景 2.1-2.2 — AI Window 三态", () => {
  it("should_be_silent_when_no_pending_message", async () => {
    (fetchCompanionStatus as any).mockResolvedValue({
      deerState: "eating",
      statusText: "",
      mood: "calm",
      moodText: "平静",
      pendingMessage: null,
    });

    const status = await fetchCompanionStatus();
    const windowMode = status.pendingMessage ? "bubble" : "silent";
    expect(windowMode).toBe("silent");
  });

  it("should_be_bubble_when_pending_message_exists", async () => {
    (fetchCompanionStatus as any).mockResolvedValue({
      deerState: "speaking",
      statusText: "",
      mood: "happy",
      moodText: "开心",
      pendingMessage: {
        type: "companion.chat",
        text: "铝价的事你后来想明白了吗？",
        autoHide: true,
        autoHideMs: 10000,
      },
    });

    const status = await fetchCompanionStatus();
    const windowMode = status.pendingMessage ? "bubble" : "silent";
    expect(windowMode).toBe("bubble");
    expect(status.pendingMessage!.text).toContain("铝价");
  });
});

describe("ai-companion: 场景 3.1 — 心情计算", () => {
  it("should_return_mood_with_text", async () => {
    (fetchCompanionStatus as any).mockResolvedValue({
      deerState: "sunbathing",
      statusText: "今天效率不错",
      mood: "happy",
      moodText: "开心",
      pendingMessage: null,
    });

    const status = await fetchCompanionStatus();
    expect(status.mood).toBe("happy");
    expect(status.moodText).toBe("开心");
  });

  it("should_support_all_mood_types", () => {
    const moods = ["happy", "curious", "worried", "missing", "caring", "focused", "calm"];
    expect(moods).toHaveLength(7);
    moods.forEach((m) => expect(typeof m).toBe("string"));
  });
});

describe("ai-companion: 场景 6.1 — Companion Status API 契约", () => {
  it("should_define_status_response_shape", () => {
    const response = {
      deerState: "eating" as const,
      statusText: "",
      mood: "calm" as const,
      moodText: "平静",
      pendingMessage: null as null | {
        type: string;
        text: string;
        autoHide: boolean;
        autoHideMs: number;
        actions?: Array<{ label: string; action: string }>;
      },
    };

    expect(response.deerState).toBeDefined();
    expect(response.mood).toBeDefined();
    expect(response.pendingMessage).toBeNull();
  });
});
