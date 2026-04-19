/**
 * use-chat retrySync / deleteSync 静态审查测试
 *
 * regression: fix-cold-resume-silent-loss (Phase 7 §5.1)
 *
 * 验证 use-chat.ts 中：
 *   - retrySync(localId): 调 captureStore.update 重置 retryCount/syncStatus → 调 triggerSync
 *   - deleteSync(localId): 调 captureStore.delete → 从 messages state 移除
 *   - 两个方法通过 return 对外暴露
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const source = fs.readFileSync(
  path.resolve(__dirname, "./use-chat.ts"),
  "utf-8",
);

describe("use-chat retrySync/deleteSync [regression: fix-cold-resume-silent-loss]", () => {
  // retrySync 函数体
  const retryStart = source.indexOf("const retrySync = useCallback");
  const retryEnd = source.indexOf("}, [", retryStart);
  const retryBody = source.slice(retryStart, retryEnd);

  // deleteSync 函数体
  const deleteStart = source.indexOf("const deleteSync = useCallback");
  const deleteEnd = source.indexOf("}, [", deleteStart);
  const deleteBody = source.slice(deleteStart, deleteEnd);

  it("should_invoke_triggerSync_and_reset_status_when_user_clicks_retry", () => {
    expect(retryStart).toBeGreaterThan(-1);
    // 必须把 captureStore 条目标回 captured + retryCount=0 + 清 lastError
    expect(retryBody).toMatch(/captureStore\.update/);
    expect(retryBody).toMatch(/syncStatus:\s*"captured"/);
    expect(retryBody).toMatch(/retryCount:\s*0/);
    expect(retryBody).toMatch(/lastError:\s*null/);
    // 必须唤醒同步调度器
    expect(retryBody).toMatch(/triggerSync\(\)/);
    // 必须更新本地 messages state（把 UI 状态也切回 captured）
    expect(retryBody).toMatch(/setMessages/);
  });

  it("should_remove_message_from_list_when_user_clicks_delete", () => {
    expect(deleteStart).toBeGreaterThan(-1);
    // 必须删 captureStore 行
    expect(deleteBody).toMatch(/captureStore\.delete/);
    // 必须从 messages state 中 filter 掉该 localId
    expect(deleteBody).toMatch(/setMessages/);
    expect(deleteBody).toMatch(/filter/);
    expect(deleteBody).toMatch(/localId/);
  });

  it("should_expose_retrySync_and_deleteSync_from_use_chat_return", () => {
    // return 对象必须包含 retrySync / deleteSync 键
    // 找最后一个 return 语句
    const retStart = source.lastIndexOf("return {");
    const retEnd = source.indexOf("};", retStart);
    const retBody = source.slice(retStart, retEnd);
    expect(retBody).toMatch(/\bretrySync\b/);
    expect(retBody).toMatch(/\bdeleteSync\b/);
  });

  it("should_extend_chat_message_type_with_retryCount_and_lastError", () => {
    expect(source).toMatch(/retryCount\?:\s*number/);
    expect(source).toMatch(/lastError\?:\s*string\s*\|\s*null/);
  });

  it("should_not_insert_connect_timeout_error_bubble_in_capture_path", () => {
    // Phase 7 §5.3：移除"连接服务器超时，请检查网络后重试"旧版文案
    expect(source).not.toContain("连接服务器超时");
  });

  it("should_use_silent_syncing_placeholder_instead_of_timeout_text [P0.3 / M4]", () => {
    // Phase 7 §5.3：armResponseTimeout 不得再写入"请求超时/请稍后重试"等阻责用户文案
    expect(source).not.toContain("请求超时，AI暂未返回");
    // 必须存在占位文案"正在同步中…"（全角省略号）
    expect(source).toMatch(/正在同步中…/);
  });

  it("should_not_close_global_ws_on_component_disconnect [P0.1 / C1]", () => {
    // 对抗审查 C1：ChatView 卸载时不得关闭全局 WS（会误报 banner）。
    // disconnect callback 内仅允许 send chat.end 与 unsub listener，
    // 禁止出现 client.disconnect()。
    const disStart = source.indexOf("const disconnect = useCallback");
    const disEnd = source.indexOf("}, [clearResponseTimeout]);", disStart);
    const disBody = source.slice(disStart, disEnd);
    expect(disStart).toBeGreaterThan(-1);
    // 剥离注释后再判断：允许注释里解释"禁止 client.disconnect()"，但代码里不得出现。
    const codeOnly = disBody.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(codeOnly).not.toMatch(/client\.disconnect\(\)/);
    // 仍需 fire-and-forget chat.end
    expect(disBody).toMatch(/chat\.end/);
    // 仍需取消订阅
    expect(disBody).toMatch(/unsubRef\.current/);
  });

  it("should_warn_when_deleting_capture_with_serverId [P0.2 / C2]", () => {
    // 对抗审查 C2：cap.serverId 非空的删除必须提示"服务端副本将在联网后清理"。
    const deleteStart = source.indexOf("const deleteSync = useCallback");
    const deleteEnd = source.indexOf("}, [", deleteStart);
    const deleteBody = source.slice(deleteStart, deleteEnd);
    // 读取 capture 并检查 serverId
    expect(deleteBody).toMatch(/captureStore\.get/);
    expect(deleteBody).toMatch(/serverId/);
    // 必须显示警告 toast（不再纯静默删除）
    expect(deleteBody).toMatch(/fabNotify/);
    expect(deleteBody).toMatch(/消息已从本设备删除/);
  });

  it("should_guard_retrySync_against_rapid_double_click [M7]", () => {
    // M7：retryInFlight Set 守卫，防止快速双击重复 update + triggerSync
    expect(source).toMatch(/retryInFlightRef/);
    const retryStart = source.indexOf("const retrySync = useCallback");
    const retryEnd = source.indexOf("}, [", retryStart);
    const retryBody = source.slice(retryStart, retryEnd);
    // 入口 return 早退守卫
    expect(retryBody).toMatch(/retryInFlightRef\.current\.has/);
    // 进入时 add，离开时 delete
    expect(retryBody).toMatch(/retryInFlightRef\.current\.add/);
    expect(retryBody).toMatch(/retryInFlightRef\.current\.delete/);
  });
});
