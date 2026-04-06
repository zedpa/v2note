import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/repositories/index.js", () => ({
  recordRepo: {
    create: vi.fn().mockResolvedValue({ id: "rec-new" }),
    markDigested: vi.fn(),
  },
  transcriptRepo: {
    create: vi.fn().mockResolvedValue({ id: "t-1" }),
  },
  summaryRepo: {
    create: vi.fn().mockResolvedValue({ id: "s-1" }),
  },
}));

import { saveConversationTool } from "./save-conversation.js";
import { recordRepo, transcriptRepo, summaryRepo } from "../../db/repositories/index.js";

const makeCtx = (messages: Array<{ role: string; content: string }>) => ({
  deviceId: "dev-1",
  userId: "user-1",
  sessionId: "s-1",
  getMessages: () => messages,
});

describe("save_conversation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should_save_last_assistant_message_as_diary_when_called", async () => {
    const ctx = makeCtx([
      { role: "user", content: "帮我写个周报" },
      { role: "assistant", content: "# 本周工作总结\n\n1. 完成了产品重构..." },
      { role: "user", content: "写为日记" },
    ]);

    const result = await saveConversationTool.handler({}, ctx);

    expect(result.success).toBe(true);
    expect(recordRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      source: "chat_tool",
      status: "completed",
    }));
    expect(transcriptRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      record_id: "rec-new",
      text: expect.stringContaining("本周工作总结"),
    }));
    expect(recordRepo.markDigested).toHaveBeenCalledWith("rec-new");
    expect(result.data!.word_count).toBeGreaterThan(0);
  });

  it("should_save_multiple_assistant_messages_when_message_count_specified", async () => {
    const ctx = makeCtx([
      { role: "assistant", content: "第一段分析内容" },
      { role: "user", content: "继续" },
      { role: "assistant", content: "第二段分析内容" },
      { role: "user", content: "保存为日记" },
    ]);

    const result = await saveConversationTool.handler({ message_count: 2 }, ctx);

    expect(result.success).toBe(true);
    expect(transcriptRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("第一段分析内容"),
    }));
    expect(transcriptRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("第二段分析内容"),
    }));
    expect(result.data!.source_messages).toBe(2);
  });

  it("should_use_custom_title_when_provided", async () => {
    const ctx = makeCtx([
      { role: "assistant", content: "报告内容..." },
    ]);

    const result = await saveConversationTool.handler({ title: "4月周报" }, ctx);

    expect(result.success).toBe(true);
    expect(summaryRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      title: "4月周报",
    }));
  });

  it("should_fail_when_no_assistant_messages", async () => {
    const ctx = makeCtx([
      { role: "user", content: "你好" },
    ]);

    const result = await saveConversationTool.handler({}, ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain("没有可保存的内容");
  });

  it("should_fail_when_no_getMessages", async () => {
    const ctx = { deviceId: "dev-1", userId: "user-1", sessionId: "s-1" };

    const result = await saveConversationTool.handler({}, ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain("无法访问对话历史");
  });

  it("should_truncate_short_summary_to_200_chars", async () => {
    const longContent = "x".repeat(500);
    const ctx = makeCtx([{ role: "assistant", content: longContent }]);

    await saveConversationTool.handler({}, ctx);

    expect(summaryRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      short_summary: "x".repeat(200),
    }));
  });

  it("should_have_notify_autonomy", () => {
    expect(saveConversationTool.autonomy).toBe("notify");
  });
});
