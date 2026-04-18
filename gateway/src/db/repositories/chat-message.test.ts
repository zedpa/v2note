import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../pool.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import {
  saveMessage,
  getHistory,
  getContextSummaries,
  getUncompressedMessages,
  markCompressed,
  getMessagesByDate,
} from "./chat-message.js";
import { query, queryOne, execute } from "../pool.js";

describe("chat-message repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 场景 1.1 + 2.1: 消息写入 ──

  describe("saveMessage", () => {
    it("should_insert_user_message_when_role_is_user", async () => {
      const mockMsg = {
        id: "msg-1",
        user_id: "u-1",
        role: "user",
        content: "你好",
        parts: null,
        compressed: false,
        created_at: "2026-04-06T10:00:00Z",
      };
      vi.mocked(queryOne).mockResolvedValue(mockMsg);

      const result = await saveMessage("u-1", "user", "你好");
      expect(result).toBe("msg-1");
      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO chat_message"),
        ["u-1", "user", "你好", null, null],
      );
    });

    it("should_insert_assistant_message_with_parts_when_has_tool_calls", async () => {
      const parts = [{ type: "tool_call", name: "search", args: {} }];
      vi.mocked(queryOne).mockResolvedValue({ id: "msg-2" } as any);

      await saveMessage("u-1", "assistant", "搜索结果如下", parts);
      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO chat_message"),
        ["u-1", "assistant", "搜索结果如下", JSON.stringify(parts), null],
      );
    });

    it("should_insert_context_summary_when_compression_runs", async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: "msg-3" } as any);

      await saveMessage("u-1", "context-summary", "用户讨论了项目计划...");
      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO chat_message"),
        ["u-1", "context-summary", "用户讨论了项目计划...", null, null],
      );
    });
  });

  // ── 场景 1.2: 不存储 system prompt（由调用方控制，repo 不做过滤） ──

  // ── 场景 3: 历史分页加载 ──

  describe("getHistory", () => {
    it("should_return_user_and_assistant_messages_excluding_context_summary", async () => {
      const mockMessages = [
        { id: "m1", role: "user", content: "你好", created_at: "2026-04-06T09:00:00Z" },
        { id: "m2", role: "assistant", content: "你好！", created_at: "2026-04-06T09:01:00Z" },
      ];
      vi.mocked(query).mockResolvedValue(mockMessages as any);

      const result = await getHistory("u-1", 30);
      expect(result).toHaveLength(2);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("role != 'context-summary'");
      expect(sql).toContain("ORDER BY created_at DESC");
      expect(sql).toContain("LIMIT");
    });

    it("should_support_cursor_pagination_with_before_id", async () => {
      vi.mocked(query).mockResolvedValue([]);

      await getHistory("u-1", 30, "msg-old");
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("created_at < (SELECT created_at FROM chat_message WHERE id =");
    });

    it("should_return_empty_array_when_no_history", async () => {
      vi.mocked(query).mockResolvedValue([]);
      const result = await getHistory("u-1", 30);
      expect(result).toEqual([]);
    });
  });

  // ── 场景 4.4 + 7.1: AI 上下文恢复 ──

  describe("getContextSummaries", () => {
    it("should_return_summaries_in_chronological_order", async () => {
      const summaries = [
        { id: "s1", role: "context-summary", content: "摘要1", created_at: "2026-04-05T00:00:00Z" },
        { id: "s2", role: "context-summary", content: "摘要2", created_at: "2026-04-06T00:00:00Z" },
      ];
      vi.mocked(query).mockResolvedValue(summaries as any);

      const result = await getContextSummaries("u-1");
      expect(result).toHaveLength(2);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("role = 'context-summary'");
      expect(sql).toContain("ORDER BY created_at ASC");
    });
  });

  describe("getUncompressedMessages", () => {
    it("should_return_recent_uncompressed_user_assistant_messages", async () => {
      const msgs = [
        { id: "m1", role: "user", content: "最近的问题" },
        { id: "m2", role: "assistant", content: "最近的回答" },
      ];
      vi.mocked(query).mockResolvedValue(msgs as any);

      const result = await getUncompressedMessages("u-1", 20);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("compressed = false");
      expect(sql).toContain("role != 'context-summary'");
      expect(result).toHaveLength(2);
    });
  });

  // ── 场景 4.2: 压缩操作 ──

  describe("markCompressed", () => {
    it("should_mark_messages_as_compressed_when_given_ids", async () => {
      vi.mocked(execute).mockResolvedValue(5);

      await markCompressed(["m1", "m2", "m3", "m4", "m5"]);
      const sql = vi.mocked(execute).mock.calls[0][0];
      expect(sql).toContain("UPDATE chat_message");
      expect(sql).toContain("compressed = true");
    });

    it("should_noop_when_given_empty_array", async () => {
      await markCompressed([]);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  // ── 场景 6.1: 每日统计 ──

  describe("getMessagesByDate", () => {
    it("should_return_messages_for_specific_date", async () => {
      const msgs = [
        { id: "m1", role: "user", content: "早上好" },
        { id: "m2", role: "assistant", content: "早上好！" },
      ];
      vi.mocked(query).mockResolvedValue(msgs as any);

      const result = await getMessagesByDate("u-1", "2026-04-06");
      expect(result).toHaveLength(2);
      const sql = vi.mocked(query).mock.calls[0][0];
      expect(sql).toContain("created_at::date");
      expect(sql).toContain("role IN ('user', 'assistant')");
    });
  });

  // ── 场景 4.1: 未压缩消息计数（触发压缩判断） ──

  describe("countUncompressed", () => {
    it("should_return_count_of_uncompressed_messages", async () => {
      vi.mocked(queryOne).mockResolvedValue({ count: "45" } as any);

      // 动态 import 以便在 mock 后获取
      const { countUncompressed } = await import("./chat-message.js");
      const count = await countUncompressed("u-1");
      expect(count).toBe(45);
      const sql = vi.mocked(queryOne).mock.calls[0][0];
      expect(sql).toContain("COUNT(*)");
      expect(sql).toContain("compressed = false");
    });
  });
});

describe("chat_message client_id idempotency", () => {
  // regression: fix-cold-resume-silent-loss
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveMessage with clientId", () => {
    it("should_persist_client_id_when_provided", async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: "msg-1" } as any);

      const { saveMessage } = await import("./chat-message.js");
      await saveMessage("u-1", "user", "hello", undefined, "local-uuid-1");

      const sql = vi.mocked(queryOne).mock.calls[0][0] as string;
      const params = vi.mocked(queryOne).mock.calls[0][1] as any[];
      expect(sql).toContain("client_id");
      expect(params).toContain("local-uuid-1");
    });

    it("should_default_client_id_to_null_when_omitted", async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: "msg-2" } as any);

      const { saveMessage } = await import("./chat-message.js");
      await saveMessage("u-1", "user", "hello");

      const params = vi.mocked(queryOne).mock.calls[0][1] as any[];
      // 最后一个参数是 client_id，应为 null
      expect(params[params.length - 1]).toBeNull();
    });
  });

  describe("findByClientId", () => {
    it("should_return_message_when_match_exists", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "msg-1",
        user_id: "u-1",
        role: "user",
        client_id: "local-uuid-1",
      } as any);

      const { findByClientId } = await import("./chat-message.js");
      const result = await findByClientId("u-1", "local-uuid-1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("msg-1");

      const sql = vi.mocked(queryOne).mock.calls[0][0] as string;
      const params = vi.mocked(queryOne).mock.calls[0][1] as any[];
      expect(sql).toContain("user_id = $1");
      expect(sql).toContain("client_id = $2");
      expect(params[0]).toBe("u-1");
      expect(params[1]).toBe("local-uuid-1");
    });

    it("should_filter_by_role_when_role_given", async () => {
      vi.mocked(queryOne).mockResolvedValue(null);

      const { findByClientId } = await import("./chat-message.js");
      await findByClientId("u-1", "local-uuid-1", "user");

      const sql = vi.mocked(queryOne).mock.calls[0][0] as string;
      const params = vi.mocked(queryOne).mock.calls[0][1] as any[];
      expect(sql).toContain("role = $3");
      expect(params).toEqual(["u-1", "local-uuid-1", "user"]);
    });

    it("should_return_null_when_no_match", async () => {
      vi.mocked(queryOne).mockResolvedValue(null);

      const { findByClientId } = await import("./chat-message.js");
      const result = await findByClientId("u-1", "missing");
      expect(result).toBeNull();
    });
  });
});
