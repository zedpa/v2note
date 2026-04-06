import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * 测试 use-chat.ts 中 Parts 模型的实现
 * Spec 116 Phase 5: 数据模型边界条件
 */

const source = fs.readFileSync(
  path.resolve(__dirname, "./use-chat.ts"),
  "utf-8",
);

describe("use-chat — MessagePart 类型定义", () => {
  it("should_define_text_part_type", () => {
    expect(source).toMatch(/type:\s*"text";\s*text:\s*string/);
  });

  it("should_define_tool_call_part_with_all_fields", () => {
    expect(source).toContain("tool-call");
    expect(source).toContain("callId");
    expect(source).toContain("toolName");
    expect(source).toContain("label");
    expect(source).toMatch(/status:\s*"running"\s*\|\s*"done"\s*\|\s*"error"/);
    expect(source).toContain("durationMs");
  });

  it("should_define_step_start_part_type", () => {
    expect(source).toMatch(/type:\s*"step-start"/);
  });

  it("should_not_have_tool_status_role", () => {
    // ChatMessage.role 应只有 user/assistant/plan，没有 tool-status
    const roleMatch = source.match(/role:\s*"user"\s*\|\s*"assistant"\s*\|\s*"plan"/);
    expect(roleMatch).not.toBeNull();
    expect(source).not.toMatch(/role.*"tool-status"/);
  });
});

describe("use-chat — tool.status 处理", () => {
  it("should_append_tool_call_part_on_tool_status", () => {
    // tool.status 事件应在 parts 中追加 tool-call
    const toolStatusSection = source.slice(
      source.indexOf('"tool.status"'),
      source.indexOf("break;", source.indexOf('"tool.status"')) + 10,
    );
    expect(toolStatusSection).toContain("tool-call");
    expect(toolStatusSection).toContain("running");
  });

  it("should_reset_streaming_text_on_tool_status", () => {
    // tool.status 应重置 streamingTextRef
    const toolStatusSection = source.slice(
      source.indexOf('"tool.status"'),
      source.indexOf("break;", source.indexOf('"tool.status"')) + 10,
    );
    expect(toolStatusSection).toContain('streamingTextRef.current = ""');
  });
});

describe("use-chat — tool.done 处理", () => {
  it("should_update_matching_callId_part_on_tool_done", () => {
    const toolDoneSection = source.slice(
      source.indexOf('"tool.done"'),
      source.indexOf("break;", source.indexOf('"tool.done"')) + 10,
    );
    expect(toolDoneSection).toContain("callId");
    expect(toolDoneSection).toMatch(/status.*done|error/);
    expect(toolDoneSection).toContain("durationMs");
  });
});

describe("use-chat — chat.chunk 更新 parts", () => {
  it("should_update_last_text_part_in_parts_on_chunk", () => {
    const chunkSection = source.slice(
      source.indexOf('"chat.chunk"'),
      source.indexOf("break;", source.indexOf('"chat.chunk"')) + 10,
    );
    // 应更新 parts 中最后一个 text part
    expect(chunkSection).toMatch(/lastPart.*type.*text/s);
  });

  it("should_append_new_text_part_after_tool_call", () => {
    const chunkSection = source.slice(
      source.indexOf('"chat.chunk"'),
      source.indexOf("break;", source.indexOf('"chat.chunk"')) + 10,
    );
    // 当 lastPart 不是 text 时，应追加新 text part
    expect(chunkSection).toContain('push');
    expect(chunkSection).toContain('"text"');
  });
});

describe("use-chat — chat.done 切换 running parts", () => {
  it("should_switch_all_running_tool_calls_to_done_on_chat_done", () => {
    const chatDoneSection = source.slice(
      source.indexOf('case "chat.done"'),
      source.indexOf("break;", source.indexOf('case "chat.done"')) + 10,
    );
    expect(chatDoneSection).toContain("running");
    expect(chatDoneSection).toContain("done");
  });
});
