/**
 * capture-push 单元测试
 *
 * regression: fix-cold-resume-silent-loss
 *
 * 覆盖：
 *   - diary 带音频：两步 POST（records → retry-audio）成功
 *   - diary 无音频：单步 POST 成功
 *   - 401 → { code: "auth" }
 *   - 403 → { code: "forbidden" }
 *   - 400/422 → { code: "bad_request" }
 *   - 5xx / 网络 → { code: "network" }
 *   - audio 上传 409 → 视为幂等成功
 *   - chat_user_msg / todo_free_text → { code: "not_implemented" }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import type { CaptureRecord } from "./capture-store";
import { captureStore, __internal as captureInternal } from "./capture-store";
import { createPushCapture } from "./capture-push";

function makeDiary(partial: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    localId: "lid-1",
    serverId: null,
    kind: "diary",
    text: null,
    audioLocalId: null,
    sourceContext: "fab",
    forceCommand: false,
    notebook: null,
    createdAt: "2026-04-18T00:00:00.000Z",
    userId: "u-1",
    syncStatus: "captured",
    lastError: null,
    retryCount: 0,
    syncingAt: null,
    guestBatchId: null,
    ...partial,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("pushCapture [regression: fix-cold-resume-silent-loss]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_throw_not_implemented_when_kind_is_todo_free_text", async () => {
    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => null,
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await expect(
      push(makeDiary({ kind: "todo_free_text", text: "todo" })),
    ).rejects.toMatchObject({ code: "not_implemented" });
  });

  it("should_post_records_once_when_diary_has_no_audio", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "rec-1", client_id: "lid-1" }));

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    const result = await push(makeDiary({ localId: "lid-1", audioLocalId: null }));

    expect(result).toEqual({ serverId: "rec-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://gw/api/v1/records");
    const body = JSON.parse(init.body);
    expect(body.client_id).toBe("lid-1");
    expect(body.source).toBe("voice");
    expect(body.status).toBe("completed"); // 无音频 → completed（不会进 pending_retry 重试流程）
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("should_post_records_and_upload_wav_when_diary_has_audio", async () => {
    const pcm = new ArrayBuffer(32000); // 1s @ 16kHz 16-bit
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "rec-2", client_id: "lid-2" }))
      .mockResolvedValueOnce(jsonResponse(200, { recordId: "rec-2", transcript: "" }));

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async (id) =>
        id === "aud-2" ? { pcmData: pcm, duration: 1 } : null,
    });

    const result = await push(makeDiary({ localId: "lid-2", audioLocalId: "aud-2" }));

    expect(result).toEqual({ serverId: "rec-2" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [createUrl, createInit] = fetchImpl.mock.calls[0];
    expect(createUrl).toBe("http://gw/api/v1/records");
    const createBody = JSON.parse(createInit.body);
    expect(createBody.status).toBe("pending_retry");
    expect(createBody.duration_seconds).toBe(1);

    const [audioUrl, audioInit] = fetchImpl.mock.calls[1];
    expect(audioUrl).toBe("http://gw/api/v1/records/rec-2/retry-audio");
    expect(audioInit.method).toBe("POST");
    expect((audioInit.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/octet-stream",
    );
    // WAV = 44 header + 32000 PCM
    expect((audioInit.body as ArrayBuffer).byteLength).toBe(44 + 32000);
  });

  it("should_treat_retry_audio_409_as_idempotent_success", async () => {
    const pcm = new ArrayBuffer(1600);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "rec-3" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Record already processed" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      );

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => ({ pcmData: pcm, duration: 0.1 }),
    });

    const result = await push(makeDiary({ audioLocalId: "aud-x" }));
    expect(result).toEqual({ serverId: "rec-3" });
  });

  it("should_classify_401_as_auth_error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "bad",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await expect(push(makeDiary())).rejects.toMatchObject({
      status: 401,
      code: "auth",
    });
  });

  it("should_classify_403_as_forbidden", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { error: "Forbidden" }));

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await expect(push(makeDiary())).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });

  it("should_classify_422_as_bad_request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(422, { error: "invalid" }));

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await expect(push(makeDiary())).rejects.toMatchObject({
      status: 422,
      code: "bad_request",
    });
  });

  it("should_classify_5xx_as_network", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: "gateway down" }));

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await expect(push(makeDiary())).rejects.toMatchObject({
      status: 503,
      code: "network",
    });
  });

  it("should_classify_fetch_throw_as_network", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("net unreachable"));

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await expect(push(makeDiary())).rejects.toMatchObject({ code: "network" });
  });

  it("should_omit_auth_header_when_token_is_null", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "rec-anon" }));

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await push(makeDiary());
    const [, init] = fetchImpl.mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  // ─── C2: subject_mismatch 跨账号防护 ─────────────────────────

  it("should_throw_subject_mismatch_when_capture_userId_differs_from_current_subject", async () => {
    const fetchImpl = vi.fn();
    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
      getCurrentUserId: () => "u-B",
    });

    await expect(push(makeDiary({ userId: "u-A" }))).rejects.toMatchObject({
      code: "subject_mismatch",
    });
    // 关键：根本不触发任何 fetch（拒绝在前）
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("should_push_when_capture_userId_matches_current_subject", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "rec-match" }));
    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
      getCurrentUserId: () => "u-A",
    });

    const r = await push(makeDiary({ userId: "u-A" }));
    expect(r.serverId).toBe("rec-match");
  });

  it("should_push_when_capture_userId_is_null_regardless_of_subject", async () => {
    // userId=null 的 capture 是游客模式，应当按当前 session 推（或被上游 401 拒绝）
    // 本函数仅在两侧都非 null 且不等时才抛 subject_mismatch
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "rec-guest" }));
    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
      getCurrentUserId: () => "u-any",
    });

    const r = await push(makeDiary({ userId: null }));
    expect(r.serverId).toBe("rec-guest");
  });

  // ─── M1: serverId 持久化避免重复步骤 1 ──────────────────────

  it("should_persist_serverId_after_step1_even_when_step2_fails", async () => {
    const pcm = new ArrayBuffer(32000);
    // 步骤 1 成功，步骤 2 返回 500
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "rec-m1" }))
      .mockResolvedValueOnce(jsonResponse(500, { error: "audio svc down" }));

    const persistServerId = vi.fn(async () => {});
    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => ({ pcmData: pcm, duration: 1 }),
      persistServerId,
    });

    await expect(push(makeDiary({ localId: "lid-m1", audioLocalId: "aud-m1" }))).rejects.toMatchObject({
      code: "network",
    });

    // 即使步骤 2 失败，步骤 1 完成后立即持久化了 serverId
    expect(persistServerId).toHaveBeenCalledWith("lid-m1", "rec-m1");
  });

  it("should_skip_step1_and_only_retry_audio_when_serverId_already_persisted", async () => {
    const pcm = new ArrayBuffer(32000);
    // 只返回 1 次响应（步骤 2）
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const persistServerId = vi.fn(async () => {});
    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => ({ pcmData: pcm, duration: 1 }),
      persistServerId,
    });

    const r = await push(
      makeDiary({ localId: "lid-m1b", audioLocalId: "aud-m1b", serverId: "rec-existing" }),
    );

    expect(r.serverId).toBe("rec-existing");
    // 只触发一次 fetch，URL 指向 /retry-audio
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://gw/api/v1/records/rec-existing/retry-audio");
    // 无需再次持久化 serverId
    expect(persistServerId).not.toHaveBeenCalled();
  });

  // ─── M5: audio blob 缺失静默降级 ─────────────────────────────

  it("should_keep_pending_retry_status_when_audio_blob_missing_but_audioLocalId_set", async () => {
    // audioLocalId 存在但 getAudioBlob 返回 null → record 仍以 pending_retry 创建
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "rec-m5" }));

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    const r = await push(makeDiary({ localId: "lid-m5", audioLocalId: "aud-lost" }));

    expect(r.serverId).toBe("rec-m5");
    expect(r.warning).toBe("audio_blob_missing");
    // 只有 1 次 POST；retry-audio 被跳过
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.status).toBe("pending_retry");
  });

  it("should_skip_retry_audio_when_audio_blob_missing", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "rec-m5b" }));

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      // getAudioBlob 抛错，也应视为缺失
      getAudioBlob: async () => {
        throw new Error("IndexedDB read failed");
      },
    });

    const r = await push(makeDiary({ audioLocalId: "aud-err" }));
    expect(r.warning).toBe("audio_blob_missing");
    // 未调用 /retry-audio
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // ─── Phase 5: chat_user_msg 推送 ─────────────────────────────

  /** 创建一个可控的 fake chat client */
  function makeFakeChatClient(overrides: Partial<{
    connected: boolean;
    sendImpl: (msg: any) => void;
    onceResponseImpl: (type: string, filter: (p: any) => boolean, ms: number) => Promise<any>;
  }> = {}) {
    const sendMock = vi.fn(overrides.sendImpl);
    const onceMock = vi.fn(
      overrides.onceResponseImpl ??
        (async (_type: string, _filter: (p: any) => boolean, _ms: number) => ({ full_text: "ok" })),
    );
    return {
      client: {
        connected: overrides.connected ?? true,
        send: sendMock as any,
        onceResponse: onceMock as any,
      },
      sendMock,
      onceMock,
    };
  }

  it("should_push_chat_user_msg_via_ws_with_client_id", async () => {
    const { client, sendMock, onceMock } = makeFakeChatClient({
      onceResponseImpl: async (_t, _f, _ms) => ({ client_id: "lid-chat-1", full_text: "hello" }),
    });

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getAudioBlob: async () => null,
      getChatClient: () => client,
    });

    const r = await push(
      makeDiary({ localId: "lid-chat-1", kind: "chat_user_msg", text: "hello" }),
    );

    expect(r).toEqual({ serverId: "lid-chat-1" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [msg] = sendMock.mock.calls[0];
    expect(msg.type).toBe("chat.message");
    expect(msg.payload.text).toBe("hello");
    expect(msg.payload.client_id).toBe("lid-chat-1");
    expect(onceMock).toHaveBeenCalledTimes(1);
    // 订阅在 send 之前注册
    const onceOrder = onceMock.mock.invocationCallOrder[0];
    const sendOrder = sendMock.mock.invocationCallOrder[0];
    expect(onceOrder).toBeLessThan(sendOrder);
  });

  it("should_throw_network_error_when_ws_not_connected_for_chat_msg", async () => {
    const { client, sendMock } = makeFakeChatClient({ connected: false });

    const push = createPushCapture({
      getGatewayBase: () => "http://gw",
      getAccessToken: () => "tok",
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getAudioBlob: async () => null,
      getChatClient: () => client,
    });

    await expect(
      push(makeDiary({ kind: "chat_user_msg", text: "hi" })),
    ).rejects.toMatchObject({ code: "network" });

    // 没触发 send
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should_resolve_when_chat_done_with_matching_client_id_received", async () => {
    // 验证 filter 只有在 client_id 匹配时才解析
    const { client } = makeFakeChatClient({
      onceResponseImpl: async (_t, filter, _ms) => {
        // 模拟 gateway 推两条 chat.done：第一条不匹配，第二条匹配
        expect(filter({ client_id: "other" })).toBe(false);
        expect(filter({ client_id: "lid-match" })).toBe(true);
        return { client_id: "lid-match", full_text: "bye" };
      },
    });

    const push = createPushCapture({
      getChatClient: () => client,
      getGatewayBase: () => "http://gw",
      getAccessToken: () => null,
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    const r = await push(
      makeDiary({ localId: "lid-match", kind: "chat_user_msg", text: "bye" }),
    );
    expect(r.serverId).toBe("lid-match");
  });

  it("should_timeout_when_chat_done_not_received_within_10s", async () => {
    // 模拟 onceResponse 超时抛出
    const { client } = makeFakeChatClient({
      onceResponseImpl: async (_t, _f, _ms) => {
        throw { code: "push_timeout", message: "timed out" };
      },
    });

    const push = createPushCapture({
      getChatClient: () => client,
      getGatewayBase: () => "http://gw",
      getAccessToken: () => null,
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await expect(
      push(makeDiary({ kind: "chat_user_msg", text: "x" })),
    ).rejects.toMatchObject({ code: "push_timeout" });
  });

  // ─── C2: 与 UI 层 chat.done 监听器的竞态保护 ───────────────────

  it("should_persist_synced_status_when_chat_done_received_via_onceResponse [C2]", async () => {
    // onceResponse resolve 时 pushChatUserMsg 必须把 captureStore 标为 synced，
    // 避免 UI 层先于 capture-push 退出时 sync-orchestrator 仍认为该条 syncing。
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(captureInternal.DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });

    // 预先在 captureStore 中创建该条（模拟 use-chat send 先落地）
    const rec = await captureStore.create({
      kind: "chat_user_msg",
      text: "hello-synced-track",
      audioLocalId: null,
      sourceContext: "chat_view",
      forceCommand: false,
      notebook: null,
      userId: "u-1",
    });

    const { client } = makeFakeChatClient({
      onceResponseImpl: async (_t, _f, _ms) => ({
        client_id: rec.localId,
        full_text: "hi back",
      }),
    });

    const push = createPushCapture({
      getChatClient: () => client,
      getGatewayBase: () => "http://gw",
      getAccessToken: () => null,
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await push({
      ...rec,
      kind: "chat_user_msg",
      text: "hello-synced-track",
    });

    const after = await captureStore.get(rec.localId);
    expect(after?.syncStatus).toBe("synced");
    expect(after?.syncingAt).toBeNull();
  });

  it("should_treat_push_as_success_when_captureStore_already_synced_before_timeout [C2]", async () => {
    // 场景：UI 层的 chat.done 监听器先到，把 captureStore 标为 synced；
    //      随后 onceResponse 超时抛 push_timeout。
    //      pushChatUserMsg 必须在抛错前再查一次 captureStore，
    //      发现已 synced → 视为成功返回。
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(captureInternal.DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });

    const rec = await captureStore.create({
      kind: "chat_user_msg",
      text: "race-hello",
      audioLocalId: null,
      sourceContext: "chat_view",
      forceCommand: false,
      notebook: null,
      userId: "u-1",
    });

    const { client } = makeFakeChatClient({
      onceResponseImpl: async (_t, _f, _ms) => {
        // 模拟：UI 层已经先到，把 captureStore 标为 synced
        await captureStore.update(rec.localId, {
          syncStatus: "synced",
          serverId: rec.localId,
          syncingAt: null,
        });
        // 然后 onceResponse 自己超时
        throw { code: "push_timeout", message: "simulated timeout" };
      },
    });

    const push = createPushCapture({
      getChatClient: () => client,
      getGatewayBase: () => "http://gw",
      getAccessToken: () => null,
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    // 不应抛错——而是视为成功返回
    const r = await push({
      ...rec,
      kind: "chat_user_msg",
      text: "race-hello",
    });
    expect(r.serverId).toBe(rec.localId);
  });

  it("should_reject_chat_user_msg_with_empty_text", async () => {
    const { client, sendMock } = makeFakeChatClient();

    const push = createPushCapture({
      getChatClient: () => client,
      getGatewayBase: () => "http://gw",
      getAccessToken: () => null,
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getAudioBlob: async () => null,
    });

    await expect(
      push(makeDiary({ kind: "chat_user_msg", text: "" })),
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(
      push(makeDiary({ kind: "chat_user_msg", text: "   " })),
    ).rejects.toMatchObject({ code: "bad_request" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
