/**
 * regression: fix-cold-resume-silent-loss
 * chat.message WS 幂等：同一 (userId, client_id) 的 user 消息
 * 不重新调用 LLM，直接返回已有 assistant 回复。
 *
 * 本文件仅覆盖 repo 查询的布尔分支与配对语义。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/repositories/index.js", () => ({
  chatMessageRepo: {
    findByClientId: vi.fn(),
    findNextAssistantAfter: vi.fn(),
  },
}));

import { chatMessageRepo } from "../db/repositories/index.js";
import { findCachedChatReply } from "./chat-idempotency.js";

describe("chat.message client_id idempotency", () => {
  // regression: fix-cold-resume-silent-loss
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_return_cached_reply_when_same_client_id_replayed", async () => {
    const userMsg = {
      id: "msg-user-1",
      user_id: "u-1",
      role: "user",
      content: "你好",
      client_id: "local-uuid-1",
      created_at: "2026-04-18T10:00:00Z",
    };
    const assistantMsg = {
      id: "msg-assistant-1",
      user_id: "u-1",
      role: "assistant",
      content: "你好！",
      created_at: "2026-04-18T10:00:05Z",
    };

    vi.mocked(chatMessageRepo.findByClientId).mockResolvedValue(userMsg as any);
    vi.mocked(chatMessageRepo.findNextAssistantAfter).mockResolvedValue(
      assistantMsg as any,
    );

    const result = await findCachedChatReply("u-1", "local-uuid-1");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("你好！");
    expect(result!.userMessageId).toBe("msg-user-1");
    expect(result!.userCreatedAt).toBe("2026-04-18T10:00:00Z");
    expect(result!.hasAssistantReply).toBe(true);
    // 必须调用 findNextAssistantAfter 而非 getHistory
    expect(chatMessageRepo.findNextAssistantAfter).toHaveBeenCalledWith(
      "u-1",
      "2026-04-18T10:00:00Z",
    );
  });

  it("should_return_null_when_client_id_not_seen", async () => {
    vi.mocked(chatMessageRepo.findByClientId).mockResolvedValue(null);

    const result = await findCachedChatReply("u-1", "local-uuid-missing");
    expect(result).toBeNull();
    // 不应继续调用 findNextAssistantAfter
    expect(chatMessageRepo.findNextAssistantAfter).not.toHaveBeenCalled();
  });

  it("should_return_null_when_client_id_missing", async () => {
    const result = await findCachedChatReply("u-1", undefined);
    expect(result).toBeNull();
    expect(chatMessageRepo.findByClientId).not.toHaveBeenCalled();
  });

  it("should_return_user_message_only_when_no_assistant_reply_yet", async () => {
    const userMsg = {
      id: "msg-user-2",
      user_id: "u-1",
      role: "user",
      content: "在吗",
      client_id: "local-uuid-2",
      created_at: "2026-04-18T10:00:00Z",
    };
    vi.mocked(chatMessageRepo.findByClientId).mockResolvedValue(userMsg as any);
    vi.mocked(chatMessageRepo.findNextAssistantAfter).mockResolvedValue(null);

    const result = await findCachedChatReply("u-1", "local-uuid-2");
    expect(result).not.toBeNull();
    expect(result!.userMessageId).toBe("msg-user-2");
    expect(result!.text).toBe("");
    expect(result!.hasAssistantReply).toBe(false);
  });

  // regression: fix-cold-resume-silent-loss
  // A4 契约：user 命中但 assistant 未配对时，返回非 null 且 hasAssistantReply === false。
  // WS 层据此"跳过 user 持久化 + 继续走 LLM"——不重复写 user 行，但补生成 assistant。
  it("should_return_cached_empty_text_when_user_exists_but_no_assistant_reply", async () => {
    const userMsg = {
      id: "msg-user-3",
      user_id: "u-1",
      role: "user",
      content: "上次崩了的那条",
      client_id: "local-uuid-3",
      created_at: "2026-04-18T10:00:00Z",
    };
    vi.mocked(chatMessageRepo.findByClientId).mockResolvedValue(userMsg as any);
    // findNextAssistantAfter 由 SQL 过滤 created_at > userMsg.created_at
    // 所以更早的 assistant 自然不会被返回；这里直接 mock null 模拟"之后没有 assistant"
    vi.mocked(chatMessageRepo.findNextAssistantAfter).mockResolvedValue(null);

    const result = await findCachedChatReply("u-1", "local-uuid-3");

    expect(result).not.toBeNull();
    expect(result!.userMessageId).toBe("msg-user-3");
    expect(result!.userCreatedAt).toBe("2026-04-18T10:00:00Z");
    expect(result!.text).toBe("");
    expect(result!.hasAssistantReply).toBe(false);
  });

  // regression: fix-cold-resume-silent-loss
  // A3 修复核心断言：跨话题场景下，user_A 的 client_id 必须配对到**紧邻的** assistant_A，
  // 而不是整个历史中**最新的** assistant_B。
  //
  // 旧实现（getHistory DESC + find）会返回 assistant_B 造成跨话题污染。
  // 新实现（findNextAssistantAfter ASC LIMIT 1）由 SQL 保证只返回 user_A 之后紧邻的那条。
  it("should_pair_with_immediate_next_assistant_not_latest", async () => {
    const userA = {
      id: "msg-user-A",
      user_id: "u-1",
      role: "user",
      content: "A 问题",
      client_id: "local-uuid-A",
      created_at: "2026-04-18T10:00:00Z",
    };
    const assistantA = {
      id: "msg-assistant-A",
      user_id: "u-1",
      role: "assistant",
      content: "A 的回答",
      created_at: "2026-04-18T10:01:00Z",
    };
    // 历史中还存在更晚的 user_B / assistant_B，但 findNextAssistantAfter
    // 由 SQL ASC LIMIT 1 保证只返回 assistantA，不会被 assistant_B 污染。
    vi.mocked(chatMessageRepo.findByClientId).mockResolvedValue(userA as any);
    vi.mocked(chatMessageRepo.findNextAssistantAfter).mockResolvedValue(
      assistantA as any,
    );

    const result = await findCachedChatReply("u-1", "local-uuid-A");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("A 的回答");
    expect(result!.userMessageId).toBe("msg-user-A");
    // 关键：必须以 userA.created_at 作为 afterCreatedAt 查询
    expect(chatMessageRepo.findNextAssistantAfter).toHaveBeenCalledWith(
      "u-1",
      "2026-04-18T10:00:00Z",
    );
    // 并且**不**能调用已废弃的 getHistory 路径
    expect((chatMessageRepo as any).getHistory).toBeUndefined();
  });
});
