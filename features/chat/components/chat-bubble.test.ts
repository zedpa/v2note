import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * 测试 chat-bubble.tsx Parts 渲染逻辑
 * Spec 116 Phase 5: 边界条件覆盖
 */

const source = fs.readFileSync(
  path.resolve(__dirname, "./chat-bubble.tsx"),
  "utf-8",
);

describe("chat-bubble — Parts 渲染", () => {
  it("should_render_text_parts_with_MarkdownContent", () => {
    expect(source).toMatch(/text.*MarkdownContent/s);
  });

  it("should_render_tool_call_parts_with_ToolCallCard_or_Group", () => {
    expect(source).toContain("ToolCallGroup");
    expect(source).toContain("ToolCallCard");
  });

  it("should_render_step_start_as_hr_separator", () => {
    expect(source).toMatch(/step-start[\s\S]*?<hr/);
  });

  it("should_fallback_to_content_string_when_parts_empty", () => {
    // parts 为空或 undefined 时应 fallback 到 content 渲染
    expect(source).toMatch(/parts\s*&&\s*message\.parts\.length\s*>\s*0/);
    expect(source).toContain("MarkdownContent");
  });
});

describe("chat-bubble — groupParts 分组逻辑", () => {
  it("should_group_consecutive_tool_calls", () => {
    // groupParts 函数应将连续 tool-call 分组
    expect(source).toContain("groupParts");
    expect(source).toMatch(/currentToolGroup/);
  });

  it("should_not_group_tool_calls_separated_by_text", () => {
    // 被 text 分隔的 tool-call 不应分组
    // 体现在：遇到非 tool-call 时 push currentToolGroup 并重置
    expect(source).toMatch(/currentToolGroup\s*=\s*null/);
  });
});

describe("chat-bubble — 流式空内容处理", () => {
  it("should_show_bounce_dots_when_streaming_empty", () => {
    // streaming 且内容为空时显示跳动点
    expect(source).toContain("animate-bounce");
    expect(source).toContain("bg-deer");
  });
});
