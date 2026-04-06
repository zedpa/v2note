import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../ai/provider.js", () => ({
  chatCompletion: vi.fn(),
}));

vi.mock("../db/repositories/chat-message.js", () => ({
  countUncompressed: vi.fn(),
  getUncompressedMessages: vi.fn(),
  saveMessage: vi.fn(),
  markCompressed: vi.fn(),
  getContextSummaries: vi.fn(),
}));

import {
  shouldCompress,
  compressMessages,
  COMPRESS_PROMPT,
} from "./chat-compression.js";
import { countUncompressed, getUncompressedMessages, saveMessage, markCompressed, getContextSummaries } from "../db/repositories/chat-message.js";
import { chatCompletion } from "../ai/provider.js";

describe("chat-compression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 场景 4.1: 压缩触发条件 ──

  describe("shouldCompress", () => {
    it("should_return_true_when_uncompressed_count_exceeds_40", async () => {
      vi.mocked(countUncompressed).mockResolvedValue(45);
      expect(await shouldCompress("u-1")).toBe(true);
    });

    it("should_return_false_when_uncompressed_count_under_40", async () => {
      vi.mocked(countUncompressed).mockResolvedValue(30);
      expect(await shouldCompress("u-1")).toBe(false);
    });
  });

  // ── 场景 4.2: 压缩执行流程 ──

  describe("compressMessages", () => {
    it("should_compress_oldest_messages_keeping_recent_20", async () => {
      // 50 条消息，应压缩最早的 30 条，保留最近 20 条
      const msgs = Array.from({ length: 50 }, (_, i) => ({
        id: `m${i}`,
        user_id: "u-1",
        role: i % 2 === 0 ? "user" : "assistant",
        content: `消息 ${i}`,
        parts: null,
        compressed: false,
        created_at: new Date(Date.now() - (50 - i) * 60000).toISOString(),
      }));

      vi.mocked(getUncompressedMessages).mockResolvedValue(msgs as any);
      vi.mocked(chatCompletion).mockResolvedValue({ content: "这是压缩摘要" });
      vi.mocked(saveMessage).mockResolvedValue("summary-1");
      vi.mocked(markCompressed).mockResolvedValue(undefined);
      vi.mocked(getContextSummaries).mockResolvedValue([]);

      await compressMessages("u-1");

      // 应该压缩前 30 条（50 - 20 = 30）
      expect(markCompressed).toHaveBeenCalledWith(
        msgs.slice(0, 30).map(m => m.id),
      );
      // 应该保存 context-summary
      expect(saveMessage).toHaveBeenCalledWith(
        "u-1",
        "context-summary",
        "这是压缩摘要",
      );
    });

    it("should_use_background_tier_for_compression", async () => {
      const msgs = Array.from({ length: 50 }, (_, i) => ({
        id: `m${i}`, user_id: "u-1", role: "user", content: `msg ${i}`,
        parts: null, compressed: false,
        created_at: new Date(Date.now() - (50 - i) * 60000).toISOString(),
      }));

      vi.mocked(getUncompressedMessages).mockResolvedValue(msgs as any);
      vi.mocked(chatCompletion).mockResolvedValue({ content: "摘要" });
      vi.mocked(saveMessage).mockResolvedValue("s-1");
      vi.mocked(markCompressed).mockResolvedValue(undefined);
      vi.mocked(getContextSummaries).mockResolvedValue([]);

      await compressMessages("u-1");

      expect(chatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ tier: "background" }),
      );
    });
  });

  // ── 场景 4.3: 压缩 prompt ──

  describe("COMPRESS_PROMPT", () => {
    it("should_contain_required_preservation_rules", () => {
      expect(COMPRESS_PROMPT).toContain("偏好");
      expect(COMPRESS_PROMPT).toContain("决策");
      expect(COMPRESS_PROMPT).toContain("人名");
      expect(COMPRESS_PROMPT).toContain("情感");
    });
  });
});
