/**
 * use-chat send() + chat.done 路径静态审查
 *
 * regression: fix-cold-resume-silent-loss (Phase 5)
 *
 * 因 useChat 为 React hook，直接实例化成本高；本测试通过源码文本断言
 * 验证关键行为约束：
 *   - send() 先调 captureStore.create（在发 WS 之前）
 *   - send() 不再 await client.waitForReady(5000)（拆阻塞）
 *   - send() 不再插入"当前未连接到服务器"错误气泡
 *   - send() 调用 client.send({ type: "chat.message", payload: { text, client_id } })
 *   - chat.done 按 client_id 匹配并把 user 消息 syncStatus 设为 "synced"
 *   - 消息对象字段扩展：localId / client_id / syncStatus
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const source = fs.readFileSync(
  path.resolve(__dirname, "./use-chat.ts"),
  "utf-8",
);

describe("use-chat send() [regression: fix-cold-resume-silent-loss]", () => {
  // Extract send() function body once for later asserts
  const sendStart = source.indexOf("const send = useCallback");
  const sendEnd = source.indexOf("}, [", sendStart);
  const sendBody = source.slice(sendStart, sendEnd);

  it("should_write_chat_user_msg_to_capture_store_before_ws_send", () => {
    // captureStore.create 必须出现在"chat.message"发送之前（非斜杠路径）
    const createIdx = sendBody.indexOf("captureStore.create");
    expect(createIdx).toBeGreaterThan(-1);

    // 取 create 之后的子串，里面必须包含 chat.message 的 send 调用
    const afterCreate = sendBody.slice(createIdx);
    expect(afterCreate).toMatch(/client\.send\(\s*\{[\s\S]*?type:\s*"chat\.message"/);

    // kind 必须是 chat_user_msg
    expect(sendBody).toMatch(/kind:\s*"chat_user_msg"/);
  });

  it("should_not_await_waitForReady_before_optimistic_render", () => {
    // send() 内部不应再调用 await waitForReady 阻塞主路径
    expect(sendBody).not.toMatch(/await\s+client\.waitForReady/);
  });

  it("should_not_insert_error_bubble_when_ws_disconnected", () => {
    // 旧版阻塞式错误文案必须移除
    expect(sendBody).not.toContain("当前未连接到服务器");
  });

  it("should_pass_client_id_when_sending_chat_message", () => {
    // client.send 时必须带 client_id（= localId）
    expect(sendBody).toMatch(/type:\s*"chat\.message"/);
    expect(sendBody).toMatch(/client_id:\s*localId/);
  });

  it("should_trigger_background_sync_when_ws_not_connected", () => {
    // 离线分支应 triggerSync（而不是插入错误消息）
    expect(sendBody).toContain("triggerSync");
    // 有 connected 判断
    expect(sendBody).toMatch(/client\.connected/);
  });

  it("should_attach_syncStatus_captured_to_optimistic_user_message", () => {
    // 乐观渲染的 user 消息必须带 syncStatus: "captured"
    expect(sendBody).toMatch(/syncStatus:\s*"captured"/);
  });

  it("should_extend_chat_message_type_with_localId_and_client_id_and_syncStatus", () => {
    // ChatMessage 接口定义必须包含新字段
    expect(source).toMatch(/localId\?:\s*string/);
    expect(source).toMatch(/client_id\?:\s*string/);
    expect(source).toMatch(/syncStatus\?:\s*ChatSyncStatus/);
    // ChatSyncStatus 枚举
    expect(source).toMatch(
      /ChatSyncStatus\s*=\s*"captured"\s*\|\s*"syncing"\s*\|\s*"synced"\s*\|\s*"failed"/,
    );
  });
});

describe("use-chat send() slash commands + lease [regression: fix-cold-resume-silent-loss]", () => {
  const sendStart = source.indexOf("const send = useCallback");
  const sendEnd = source.indexOf("}, [", sendStart);
  const sendBody = source.slice(sendStart, sendEnd);

  it("should_not_write_slash_commands_to_capture_store [M3]", () => {
    // 斜杠命令（/compact 等）必须在 captureStore.create 之前早返回，
    // 否则离线时会被当作普通 chat.message 推送，污染 gateway LLM 上下文。
    // 断言：出现 isSlashCommand 判断，且在 captureStore.create 之前 return
    expect(sendBody).toMatch(/isSlashCommand/);
    const slashCheck = sendBody.indexOf("isSlashCommand");
    const captureCreate = sendBody.indexOf("captureStore.create");
    expect(slashCheck).toBeGreaterThan(-1);
    expect(captureCreate).toBeGreaterThan(-1);
    expect(slashCheck).toBeLessThan(captureCreate);

    // 判断正则必须识别 / 开头
    expect(sendBody).toMatch(/startsWith\("\/"\)/);
    // 必须有 return 分支（斜杠命令早退出）
    const slashBlock = sendBody.slice(slashCheck, captureCreate);
    expect(slashBlock).toMatch(/return;/);
  });

  it("should_mark_capture_as_syncing_before_ws_send_when_online [C1]", () => {
    // 在线分支：client.send chat.message 之前必须把 captureStore 标为 syncing + syncingAt
    // 用于防止 sync-orchestrator worker 重复推送同一条。
    const createIdx = sendBody.indexOf("captureStore.create");
    const afterCreate = sendBody.slice(createIdx);
    // 找到 "chat.message" 的 send 调用
    const chatMsgSendIdx = afterCreate.search(/client\.send\(\s*\{[\s\S]*?type:\s*"chat\.message"/);
    expect(chatMsgSendIdx).toBeGreaterThan(-1);
    // chat.message send 之前必须有 captureStore.update( ... syncStatus: "syncing" ... )
    const beforeChatSend = afterCreate.slice(0, chatMsgSendIdx);
    expect(beforeChatSend).toMatch(/captureStore\.update\([\s\S]*?syncStatus:\s*"syncing"[\s\S]*?syncingAt:/);
  });

  it("should_not_trigger_sync_in_online_path [C1]", () => {
    // 在线分支（client.connected 为 true 的分支）不应调用 triggerSync()
    // 否则 worker 会在 chat.done 到达前读到条目并双推。
    // 做法：定位 "client.connected" 的 if 块，在该块内 triggerSync 只允许出现在 setTimeout 兜底里
    const connectedIfIdx = sendBody.indexOf("client.connected");
    expect(connectedIfIdx).toBeGreaterThan(-1);
    // 找下一个 else 或 } 结束
    const elseIdx = sendBody.indexOf("} else", connectedIfIdx);
    const onlineBlock = sendBody.slice(connectedIfIdx, elseIdx === -1 ? sendBody.length : elseIdx);

    // triggerSync 若出现，必须在 setTimeout 内（兜底）
    const allTrigger = [...onlineBlock.matchAll(/triggerSync\(\)/g)];
    for (const m of allTrigger) {
      // 查看该 triggerSync 前 200 字符内是否有 setTimeout
      const start = Math.max(0, m.index! - 200);
      const context = onlineBlock.slice(start, m.index!);
      expect(context).toMatch(/setTimeout/);
    }
  });

  it("should_schedule_40s_fallback_triggerSync_after_ws_send [C1]", () => {
    // 在线分支应该有 setTimeout(... triggerSync, 40_000) 兜底
    // 以便在 chat.done 未到达时 worker 能在 60s 租约过期后重试。
    expect(sendBody).toMatch(/setTimeout\(\s*\(\)\s*=>\s*\{?\s*triggerSync\(\)/);
    // 40000 出现（或 40_000）
    expect(sendBody).toMatch(/40[,_]?000/);
  });
});

describe("use-chat chat.done [regression: fix-cold-resume-silent-loss]", () => {
  it("should_update_syncStatus_synced_when_chat_done_returns_matching_client_id", () => {
    const chatDoneStart = source.indexOf('case "chat.done"');
    const chatDoneEnd = source.indexOf("break;", chatDoneStart);
    const chatDoneBody = source.slice(chatDoneStart, chatDoneEnd);

    // 必须从 payload 里取 client_id
    expect(chatDoneBody).toMatch(/client_id/);
    // 必须按 client_id 匹配 user 消息
    expect(chatDoneBody).toMatch(/role\s*===\s*"user"/);
    expect(chatDoneBody).toMatch(/syncStatus:\s*"synced"/);
    // 必须同步回写 captureStore（让 sync-orchestrator 感知）
    expect(chatDoneBody).toContain("captureStore");
  });
});
