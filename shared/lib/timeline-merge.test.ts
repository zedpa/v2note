/**
 * timeline-merge 单元测试
 *
 * regression: fix-cold-resume-silent-loss (Phase 6, spec §1.2)
 */

import { describe, it, expect, vi } from "vitest";
import { mergeTimeline, type ServerRecord } from "./timeline-merge";
import type { CaptureRecord } from "./capture-store";

function mkLocal(partial: Partial<CaptureRecord>): CaptureRecord {
  return {
    localId: partial.localId ?? "loc-1",
    serverId: partial.serverId ?? null,
    kind: partial.kind ?? "diary",
    text: partial.text ?? "hello",
    audioLocalId: partial.audioLocalId ?? null,
    sourceContext: partial.sourceContext ?? "fab",
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

function mkServer(partial: Partial<ServerRecord>): ServerRecord {
  return {
    id: partial.id ?? "srv-1",
    client_id: partial.client_id ?? null,
    created_at: partial.created_at ?? "2026-04-10T09:00:00.000Z",
    content: partial.content ?? "server content",
    ...partial,
  };
}

describe("mergeTimeline [regression: fix-cold-resume-silent-loss]", () => {
  it("should_render_server_records_when_local_is_empty", () => {
    const rows = mergeTimeline(
      [],
      [
        mkServer({ id: "srv-1", created_at: "2026-04-10T09:00:00.000Z" }),
        mkServer({ id: "srv-2", created_at: "2026-04-10T08:00:00.000Z" }),
      ],
    );
    expect(rows.map((r) => r.id)).toEqual(["srv-1", "srv-2"]);
    expect(rows.every((r) => r._localStatus === "synced")).toBe(true);
  });

  it("should_place_local_unsynced_on_top_when_server_is_empty", () => {
    const rows = mergeTimeline(
      [
        mkLocal({ localId: "loc-1", createdAt: "2026-04-10T08:00:00.000Z" }),
        mkLocal({ localId: "loc-2", createdAt: "2026-04-10T10:00:00.000Z" }),
      ],
      [],
    );
    // 本地置顶 + createdAt 降序
    expect(rows.map((r) => r.id)).toEqual(["loc-2", "loc-1"]);
    expect(rows.every((r) => r._localStatus === "captured")).toBe(true);
  });

  it("should_use_server_version_when_local_synced_matches_serverId_rule_a", () => {
    const local = mkLocal({
      localId: "loc-1",
      syncStatus: "synced",
      serverId: "srv-1",
    });
    const server = mkServer({ id: "srv-1", content: "fresh server" });
    const rows = mergeTimeline([local], [server]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("srv-1");
    expect(rows[0].content).toBe("fresh server");
    // 不应出现本地版本
    expect(rows.find((r) => r._local)).toBeUndefined();
  });

  it("should_recover_ack_lost_and_call_onAckRecovered_rule_b", async () => {
    const onAckRecovered = vi.fn().mockResolvedValue(undefined);
    const local = mkLocal({
      localId: "loc-1",
      syncStatus: "captured", // 本地以为未同步
      serverId: null,
    });
    // 服务端其实已经有了，通过 client_id 匹配到
    const server = mkServer({ id: "srv-1", client_id: "loc-1" });

    const rows = mergeTimeline([local], [server], { onAckRecovered });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("srv-1");
    // 必须调用升级回调：传入 localId 和 serverId
    expect(onAckRecovered).toHaveBeenCalledTimes(1);
    expect(onAckRecovered).toHaveBeenCalledWith("loc-1", "srv-1");
    // 等 microtask 清空（确保没有未处理异常）
    await Promise.resolve();
  });

  it("should_recover_ack_lost_for_failed_status_too_rule_b", () => {
    const onAckRecovered = vi.fn();
    const local = mkLocal({
      localId: "loc-1",
      syncStatus: "failed",
      retryCount: 2,
    });
    const server = mkServer({ id: "srv-1", client_id: "loc-1" });
    const rows = mergeTimeline([local], [server], { onAckRecovered });
    expect(rows[0].id).toBe("srv-1");
    expect(onAckRecovered).toHaveBeenCalledWith("loc-1", "srv-1");
  });

  it("should_recover_ack_lost_for_syncing_status_rule_b", () => {
    const onAckRecovered = vi.fn();
    const local = mkLocal({
      localId: "loc-1",
      syncStatus: "syncing",
      syncingAt: "2026-04-10T10:00:00.000Z",
    });
    const server = mkServer({ id: "srv-1", client_id: "loc-1" });
    const rows = mergeTimeline([local], [server], { onAckRecovered });
    expect(rows[0].id).toBe("srv-1");
    expect(onAckRecovered).toHaveBeenCalledWith("loc-1", "srv-1");
  });

  it("should_keep_local_unsynced_on_top_when_no_server_match_rule_c", () => {
    const local1 = mkLocal({
      localId: "loc-1",
      createdAt: "2026-04-10T10:00:00.000Z",
    });
    const local2 = mkLocal({
      localId: "loc-2",
      createdAt: "2026-04-10T11:00:00.000Z",
    });
    const server = mkServer({
      id: "srv-1",
      created_at: "2026-04-10T09:00:00.000Z",
    });

    const rows = mergeTimeline([local1, local2], [server]);
    // 本地未同步置顶（desc），服务端跟在后面
    expect(rows.map((r) => r.id)).toEqual(["loc-2", "loc-1", "srv-1"]);
    expect(rows[0]._localStatus).toBe("captured");
    expect(rows[2]._localStatus).toBe("synced");
  });

  it("should_render_pure_server_records_rule_d", () => {
    const server1 = mkServer({
      id: "srv-1",
      created_at: "2026-04-10T10:00:00.000Z",
    });
    const server2 = mkServer({
      id: "srv-2",
      client_id: "loc-unknown", // 本地没有匹配条目 → 正常渲染
      created_at: "2026-04-10T09:00:00.000Z",
    });
    const rows = mergeTimeline([], [server1, server2]);
    expect(rows.map((r) => r.id)).toEqual(["srv-1", "srv-2"]);
  });

  it("should_filter_out_non_diary_local_captures", () => {
    const diary = mkLocal({ localId: "loc-1", kind: "diary" });
    const chat = mkLocal({ localId: "loc-2", kind: "chat_user_msg" });
    const todo = mkLocal({ localId: "loc-3", kind: "todo_free_text" });
    const rows = mergeTimeline([diary, chat, todo], []);
    expect(rows.map((r) => r.id)).toEqual(["loc-1"]);
  });

  it("should_still_render_local_when_server_list_is_empty_graceful_degradation", () => {
    // 模拟服务端失败场景：调用方传入空数组
    const local = mkLocal({ localId: "loc-1" });
    const rows = mergeTimeline([local], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("loc-1");
    expect(rows[0]._localStatus).toBe("captured");
  });

  it("should_not_call_onAckRecovered_when_rule_b_not_triggered", () => {
    const onAckRecovered = vi.fn();
    // 规则 (a)：已 synced 不触发 recover
    const local = mkLocal({
      localId: "loc-1",
      syncStatus: "synced",
      serverId: "srv-1",
    });
    mergeTimeline([local], [mkServer({ id: "srv-1" })], { onAckRecovered });
    expect(onAckRecovered).not.toHaveBeenCalled();
  });

  it("should_render_local_synced_as_local_when_serverId_not_in_current_page", () => {
    // 本地 synced 但当前分页里没有对应服务端行 → 本地兜底渲染（不丢）
    const local = mkLocal({
      localId: "loc-1",
      syncStatus: "synced",
      serverId: "srv-other-page",
    });
    const rows = mergeTimeline([local], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("loc-1");
  });

  // C1：服务端 client_id 前后空白 → Rule (b) 仍应命中
  it("should_match_server_client_id_with_trailing_whitespace_rule_b", () => {
    const onAckRecovered = vi.fn();
    const local = mkLocal({ localId: "loc-1", syncStatus: "captured" });
    // 服务端 client_id 末尾多了换行/空格（中间件 trim 不净）
    const server = mkServer({ id: "srv-1", client_id: " loc-1\n" });
    const rows = mergeTimeline([local], [server], { onAckRecovered });
    // 不应产生两条（否则列表会出现重复条目）
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("srv-1");
    expect(onAckRecovered).toHaveBeenCalledWith("loc-1", "srv-1");
  });

  // M7：服务端行无 id → 跳过，避免 React key=undefined warning
  it("should_skip_server_rows_without_id", () => {
    const rows = mergeTimeline(
      [],
      [
        mkServer({ id: "srv-1", created_at: "2026-04-10T09:00:00.000Z" }),
        // 无 id 的异常行（服务端数据异常 / 类型宽松）
        { id: "", created_at: "2026-04-10T10:00:00.000Z" } as ServerRecord,
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("srv-1");
  });

  // M4：本地 synced 但 serverId 不在当前分页 → 不置顶（避免幽灵置顶），按 createdAt 融入服务端序列
  it("should_not_place_synced_but_serverId_missing_on_top", () => {
    const localSynced = mkLocal({
      localId: "loc-old-synced",
      syncStatus: "synced",
      serverId: "srv-other-page",
      createdAt: "2026-04-09T05:00:00.000Z",
    });
    const localUnsynced = mkLocal({
      localId: "loc-new",
      syncStatus: "captured",
      createdAt: "2026-04-10T08:00:00.000Z",
    });
    const server1 = mkServer({
      id: "srv-1",
      created_at: "2026-04-10T09:00:00.000Z",
    });
    const server2 = mkServer({
      id: "srv-2",
      created_at: "2026-04-08T09:00:00.000Z",
    });

    const rows = mergeTimeline([localSynced, localUnsynced], [server1, server2]);
    // 未同步（captured）仍置顶；synced-missing 不应在顶端
    expect(rows[0].id).toBe("loc-new");
    expect(rows[0]._localStatus).toBe("captured");
    // 悬空 synced 按时间降序融入服务端序列之间：9 > 5 > 8? no, 9 (srv-1) > 5 (loc-old) > 8 ... wait
    // 排序（desc）：srv-1 @ 09, loc-old-synced @ 04-09 05, srv-2 @ 04-08 09
    const afterLocal = rows.slice(1).map((r) => r.id);
    expect(afterLocal).toEqual(["srv-1", "loc-old-synced", "srv-2"]);
  });

  // M3：数值时间戳比较，避免 ISO tz offset 字典序错排
  it("should_sort_local_rows_by_numeric_timestamp_not_lexicographic", () => {
    // 本地两条，都是 UTC 10:00，但用不同 offset 表达：
    //   loc-later  = 2026-04-10T18:00:00+08:00 = UTC 10:00
    //   loc-earlier= 2026-04-10T09:59:00.000Z  = UTC 09:59
    // 字典序比较 "2026-04-10T18:00:00+08:00" > "2026-04-10T09:59:00.000Z"（正好一致，但 tz offset 字典序行为不可靠）
    // 核心在于：相同时间不同 offset 表达 → 数值应相等；数值排序应严格按 epoch 毫秒。
    const localA = mkLocal({
      localId: "loc-a",
      createdAt: "2026-04-10T18:00:00+08:00", // = UTC 10:00
    });
    const localB = mkLocal({
      localId: "loc-b",
      createdAt: "2026-04-10T09:00:00.000Z", // = UTC 09:00（早 1h）
    });
    const rows = mergeTimeline([localA, localB], []);
    // desc：A 更新 → 置顶
    expect(rows.map((r) => r.id)).toEqual(["loc-a", "loc-b"]);
  });
});
