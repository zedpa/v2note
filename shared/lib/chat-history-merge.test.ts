/**
 * chat-history-merge 单元测试
 *
 * regression: fix-cold-resume-silent-loss (Phase 6, spec §3.3)
 */

import { describe, it, expect, vi } from "vitest";
import { mergeChatHistory, type ServerChatMessage } from "./chat-history-merge";
import type { CaptureRecord } from "./capture-store";

function mkLocal(partial: Partial<CaptureRecord>): CaptureRecord {
  return {
    localId: partial.localId ?? "loc-1",
    serverId: partial.serverId ?? null,
    kind: partial.kind ?? "chat_user_msg",
    text: partial.text ?? "你好",
    audioLocalId: partial.audioLocalId ?? null,
    sourceContext: partial.sourceContext ?? "chat_view",
    forceCommand: partial.forceCommand ?? false,
    notebook: partial.notebook ?? null,
    createdAt: partial.createdAt ?? "2026-04-10T10:00:00.000Z",
    userId: partial.userId ?? "u-1",
    syncStatus: partial.syncStatus ?? "captured",
    lastError: partial.lastError ?? null,
    retryCount: partial.retryCount ?? 0,
    syncingAt: partial.syncingAt ?? null,
  };
}

function mkServer(partial: Partial<ServerChatMessage>): ServerChatMessage {
  return {
    id: partial.id ?? "srv-1",
    client_id: partial.client_id ?? null,
    role: partial.role ?? "user",
    content: partial.content ?? "服务端消息",
    created_at: partial.created_at ?? "2026-04-10T09:00:00.000Z",
    parts: partial.parts,
    ...partial,
  };
}

describe("mergeChatHistory [regression: fix-cold-resume-silent-loss]", () => {
  it("should_render_server_messages_when_local_is_empty", () => {
    const rows = mergeChatHistory(
      [],
      [
        mkServer({ id: "s1", created_at: "2026-04-10T08:00:00.000Z" }),
        mkServer({
          id: "s2",
          role: "assistant",
          content: "hi",
          created_at: "2026-04-10T08:01:00.000Z",
        }),
      ],
    );
    expect(rows.map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(rows.every((r) => r.syncStatus === "synced")).toBe(true);
  });

  it("should_render_local_chat_user_msg_when_server_is_empty", () => {
    const rows = mergeChatHistory(
      [
        mkLocal({
          localId: "loc-1",
          text: "离线发的",
          createdAt: "2026-04-10T10:00:00.000Z",
        }),
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("loc-1");
    expect(rows[0].content).toBe("离线发的");
    expect(rows[0].role).toBe("user");
    expect(rows[0].syncStatus).toBe("captured");
    // client_id 透传
    expect(rows[0].client_id).toBe("loc-1");
  });

  it("should_use_server_version_when_local_synced_rule_a", () => {
    const local = mkLocal({
      localId: "loc-1",
      syncStatus: "synced",
      serverId: "srv-1",
    });
    const server = mkServer({
      id: "srv-1",
      content: "服务端真相",
      created_at: "2026-04-10T09:00:00.000Z",
    });
    const rows = mergeChatHistory([local], [server]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("srv-1");
    expect(rows[0].content).toBe("服务端真相");
  });

  it("should_recover_ack_lost_when_client_id_matches_rule_b", () => {
    const onAckRecovered = vi.fn();
    const local = mkLocal({
      localId: "loc-1",
      syncStatus: "captured",
      text: "本地以为未发",
    });
    const server = mkServer({
      id: "srv-1",
      client_id: "loc-1",
      content: "服务端已收到",
    });
    const rows = mergeChatHistory([local], [server], { onAckRecovered });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("srv-1");
    expect(onAckRecovered).toHaveBeenCalledTimes(1);
    expect(onAckRecovered).toHaveBeenCalledWith("loc-1", "srv-1");
  });

  it("should_call_onAckRecovered_for_failed_and_syncing_too_rule_b", () => {
    const onAckRecovered = vi.fn();
    const local1 = mkLocal({ localId: "loc-1", syncStatus: "failed" });
    const local2 = mkLocal({ localId: "loc-2", syncStatus: "syncing" });
    const s1 = mkServer({ id: "s1", client_id: "loc-1" });
    const s2 = mkServer({ id: "s2", client_id: "loc-2" });
    mergeChatHistory([local1, local2], [s1, s2], { onAckRecovered });
    expect(onAckRecovered).toHaveBeenCalledWith("loc-1", "s1");
    expect(onAckRecovered).toHaveBeenCalledWith("loc-2", "s2");
  });

  it("should_merge_local_and_server_sorted_by_created_at_rule_c_and_d", () => {
    const local = mkLocal({
      localId: "loc-1",
      text: "本地未同步",
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    const server1 = mkServer({
      id: "s1",
      content: "早",
      created_at: "2026-04-10T08:00:00.000Z",
    });
    const server2 = mkServer({
      id: "s2",
      role: "assistant",
      content: "中",
      created_at: "2026-04-10T09:00:00.000Z",
    });

    const rows = mergeChatHistory([local], [server1, server2]);
    // 按 created_at 升序
    expect(rows.map((r) => r.id)).toEqual(["s1", "s2", "loc-1"]);
    expect(rows[2].syncStatus).toBe("captured");
  });

  it("should_filter_non_chat_user_msg_kinds", () => {
    const chat = mkLocal({ localId: "loc-1", kind: "chat_user_msg" });
    const diary = mkLocal({ localId: "loc-2", kind: "diary" });
    const rows = mergeChatHistory([chat, diary], []);
    expect(rows.map((r) => r.id)).toEqual(["loc-1"]);
  });

  it("should_still_render_local_when_server_is_empty_graceful_degradation", () => {
    const rows = mergeChatHistory(
      [mkLocal({ localId: "loc-1", text: "离线可见" })],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("离线可见");
  });

  it("should_not_call_onAckRecovered_when_already_synced_or_no_match", () => {
    const onAckRecovered = vi.fn();
    // 规则 (a)：已 synced 不触发 recover
    const local = mkLocal({
      localId: "loc-1",
      syncStatus: "synced",
      serverId: "srv-1",
    });
    mergeChatHistory([local], [mkServer({ id: "srv-1" })], { onAckRecovered });
    expect(onAckRecovered).not.toHaveBeenCalled();
  });

  // C2：服务端某行 created_at 为 null → 不崩溃（数值比较 + NaN 兜底）
  it("should_not_crash_when_server_row_has_null_created_at", () => {
    // 构造一条 created_at 为 null 的异常服务端行（类型上 created_at 是 string，
    // 但 runtime JSON 可能传 null。用 as unknown as 绕过类型检查）
    const malformed = {
      id: "srv-null",
      client_id: null,
      role: "assistant",
      content: "时间字段异常",
      created_at: null,
    } as unknown as ServerChatMessage;
    const normal = mkServer({
      id: "srv-ok",
      created_at: "2026-04-10T09:00:00.000Z",
    });

    // 原实现中 a.created_at.localeCompare(...) 会对 null 调用方法 → TypeError
    expect(() => mergeChatHistory([], [malformed, normal])).not.toThrow();
    const rows = mergeChatHistory([], [malformed, normal]);
    expect(rows.map((r) => r.id).sort()).toEqual(["srv-null", "srv-ok"]);
  });

  // C4（§2.4 语音降级）：audioLocalId 必须从本地 capture 透传到合并行
  it("should_pass_through_audioLocalId_for_voice_degraded_captures", () => {
    const local = mkLocal({
      localId: "loc-voice-1",
      text: "[转写失败占位]",
      audioLocalId: "audio-blob-1",
      syncStatus: "captured",
    });
    const rows = mergeChatHistory([local], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].audioLocalId).toBe("audio-blob-1");
    expect(rows[0].localId).toBe("loc-voice-1");
  });

  // C4 补充：纯服务端行 audioLocalId 为 null（no-op，不透传本地字段）
  it("should_set_audioLocalId_null_for_pure_server_rows", () => {
    const server = mkServer({ id: "srv-1", content: "来自服务端" });
    const rows = mergeChatHistory([], [server]);
    expect(rows[0].audioLocalId).toBeNull();
  });

  // C1：服务端 client_id 前后空白 → Rule (b) 仍应命中
  it("should_match_server_client_id_with_trailing_whitespace_rule_b", () => {
    const onAckRecovered = vi.fn();
    const local = mkLocal({ localId: "loc-1", syncStatus: "captured" });
    const server = mkServer({ id: "srv-1", client_id: " loc-1\n" });
    const rows = mergeChatHistory([local], [server], { onAckRecovered });
    // 不应重复（否则聊天列表里会出现双条）
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("srv-1");
    expect(onAckRecovered).toHaveBeenCalledWith("loc-1", "srv-1");
  });

  // M7：服务端行无 id → 跳过
  it("should_skip_server_rows_without_id", () => {
    const malformed = {
      id: "",
      role: "user",
      content: "缺 id",
      created_at: "2026-04-10T10:00:00.000Z",
    } as unknown as ServerChatMessage;
    const normal = mkServer({ id: "srv-ok" });
    const rows = mergeChatHistory([], [malformed, normal]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("srv-ok");
  });
});
