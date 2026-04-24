/**
 * voice-todo-ext D6: Agent 状态流实时化 — tool.done 事件处理
 *
 * 测试 app/page.tsx 中 tool.done WebSocket 消息处理逻辑：
 * - 监听 tool.done 消息
 * - 将完成状态（成功/失败 + message）追加到 commandToolStatuses
 * - 类型定义在 gateway-client.ts 中已声明
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// 读取 page.tsx 源码验证 tool.done 处理逻辑
const pageSource = fs.readFileSync(
  path.resolve(__dirname, "../../../app/page.tsx"),
  "utf-8",
);

// 读取 gateway-client.ts 验证类型定义
const clientSource = fs.readFileSync(
  path.resolve(__dirname, "../../chat/lib/gateway-client.ts"),
  "utf-8",
);

describe("D6: tool.done 事件处理", () => {
  it("should_handle_tool_done_message_type_when_ws_event_received", () => {
    // page.tsx 中应有 tool.done case 分支
    expect(pageSource).toContain("tool.done");
  });

  it("should_extract_success_and_message_from_tool_done_payload", () => {
    // 应从 payload 中解构 success 和 message
    const toolDoneSection = pageSource.slice(
      pageSource.indexOf('"tool.done"'),
      pageSource.indexOf("break;", pageSource.indexOf('"tool.done"')) + 10,
    );
    expect(toolDoneSection).toContain("success");
    expect(toolDoneSection).toContain("message");
  });

  it("should_append_success_label_to_tool_statuses_when_tool_done_success", () => {
    const toolDoneSection = pageSource.slice(
      pageSource.indexOf('"tool.done"'),
      pageSource.indexOf("break;", pageSource.indexOf('"tool.done"')) + 10,
    );
    // 成功时应显示 checkmark
    expect(toolDoneSection).toMatch(/✅/);
  });

  it("should_append_failure_label_to_tool_statuses_when_tool_done_failure", () => {
    const toolDoneSection = pageSource.slice(
      pageSource.indexOf('"tool.done"'),
      pageSource.indexOf("break;", pageSource.indexOf('"tool.done"')) + 10,
    );
    // 失败时应显示 cross mark
    expect(toolDoneSection).toMatch(/❌/);
  });

  it("should_update_command_tool_statuses_state_when_tool_done_received", () => {
    const toolDoneSection = pageSource.slice(
      pageSource.indexOf('"tool.done"'),
      pageSource.indexOf("break;", pageSource.indexOf('"tool.done"')) + 10,
    );
    // 应追加到 commandToolStatuses
    expect(toolDoneSection).toContain("setCommandToolStatuses");
    expect(toolDoneSection).toContain("prev");
  });

  it("should_only_update_when_command_sheet_open_when_tool_done_received", () => {
    const toolDoneSection = pageSource.slice(
      pageSource.indexOf('"tool.done"'),
      pageSource.indexOf("break;", pageSource.indexOf('"tool.done"')) + 10,
    );
    // 只在 commandSheet 打开时更新
    expect(toolDoneSection).toContain("commandSheetOpenRef.current");
  });

  it("should_fallback_to_toolname_when_message_is_empty_in_tool_done", () => {
    const toolDoneSection = pageSource.slice(
      pageSource.indexOf('"tool.done"'),
      pageSource.indexOf("break;", pageSource.indexOf('"tool.done"')) + 10,
    );
    // message 为空时应 fallback 到 toolName
    expect(toolDoneSection).toContain("toolName");
    expect(toolDoneSection).toMatch(/message\s*\|\|\s*toolName/);
  });
});

describe("D6: tool.done 类型定义", () => {
  it("should_define_tool_done_type_in_gateway_client_when_type_checked", () => {
    expect(clientSource).toContain("tool.done");
  });

  it("should_include_success_field_in_tool_done_payload", () => {
    // tool.done payload 应有 success: boolean
    const toolDoneTypeSection = clientSource.slice(
      clientSource.indexOf("tool.done"),
      clientSource.indexOf("}", clientSource.indexOf("tool.done")) + 20,
    );
    expect(toolDoneTypeSection).toContain("success");
  });

  it("should_include_message_field_in_tool_done_payload", () => {
    const toolDoneTypeSection = clientSource.slice(
      clientSource.indexOf("tool.done"),
      clientSource.indexOf("}", clientSource.indexOf("tool.done")) + 20,
    );
    expect(toolDoneTypeSection).toContain("message");
  });
});
