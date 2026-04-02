import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * 测试 use-chat.ts 中 chat.done 空内容处理
 * 根因：chat.done 空内容时前端显示空气泡，无兜底文本
 */

describe("use-chat — chat.done 空内容兜底", () => {
  it("should_have_fallback_for_empty_assistant_message_in_chat_done_handler", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "./use-chat.ts"),
      "utf-8",
    );

    // chat.done handler 应该检查最后一条 assistant 消息是否为空
    // 如果为空，应替换为兜底文本
    expect(source).toContain("chat.done");

    // 确认有空内容检查逻辑（!last.content 或 last.content === ""）
    // 这比硬编码字符串更灵活
    const chatDoneSection = source.slice(
      source.indexOf('case "chat.done"'),
      source.indexOf("break;", source.indexOf('case "chat.done"')) + 10,
    );

    // 应该有对 content 为空的检查
    expect(chatDoneSection).toMatch(/!last\.content|last\.content\s*===?\s*""/);
  });
});
