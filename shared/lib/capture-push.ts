/**
 * Capture Push — 把本地 captureStore 中未同步的条目推向 gateway。
 *
 * regression: fix-cold-resume-silent-loss (Phase 4)
 *
 * 为 sync-orchestrator 提供 `pushCapture` 实现：
 *   - diary：走 POST /api/v1/records（带 client_id 幂等）+ 可选 WAV 二进制上传
 *   - chat_user_msg / todo_free_text：本期不实现，抛 `{ code: "not_implemented" }`
 *
 * 错误分类契约（与 sync-orchestrator.PushError 对齐）：
 *   - 401 → { status: 401, code: "auth" }
 *   - 403 / 422 / 400 → { status, code: "bad_request" | "forbidden" }
 *   - 网络 / 5xx → { code: "network" }
 *   - 其他 → 原样抛（sync-orchestrator 兜底走 network 分支）
 */

import type { CaptureRecord } from "./capture-store";
import { captureStore } from "./capture-store";
import { addWavHeader } from "@/features/recording/lib/audio-cache";

export interface PushResult {
  serverId: string;
  /** 推送过程的软告警（如音频 blob 读失败但 record 已创建）— M5 */
  warning?: "audio_blob_missing";
}

/**
 * 注入点：获取 gateway 基础 URL。独立一层抽象便于测试覆盖。
 * 直接 import 默认实现即可；测试通过 vi.mock 或参数覆盖。
 */
async function defaultGetGatewayBase(): Promise<string> {
  const { getGatewayHttpUrl } = await import("./gateway-url");
  return getGatewayHttpUrl();
}

/** 默认 token 读取（可被测试替换） */
async function defaultGetAccessToken(): Promise<string | null> {
  const { getAccessToken } = await import("./auth");
  return getAccessToken();
}

/**
 * 默认当前用户 id（可被测试替换） — C2
 *
 * 延迟绑定：首次调用时从 auth 模块读取 getCurrentUser；失败则返回 null。
 * 测试环境 / SSR 环境 auth 未初始化时不应抛错。
 */
let _cachedGetCurrentUser: (() => { id: string } | null) | null = null;
function defaultGetCurrentUserId(): string | null {
  try {
    if (!_cachedGetCurrentUser) {
      // 顶部已 import 过类型；值层动态加载以避免循环依赖
      // auth 模块在客户端启动时被初始化（layout mount）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./auth") as { getCurrentUser?: () => { id: string } | null };
      if (typeof mod.getCurrentUser === "function") {
        _cachedGetCurrentUser = mod.getCurrentUser;
      }
    }
    return _cachedGetCurrentUser?.()?.id ?? null;
  } catch {
    return null;
  }
}

export interface PushCaptureDeps {
  /** 获取 HTTP base URL（测试注入 "http://x" 即可） */
  getGatewayBase?: () => Promise<string> | string;
  /** 获取 Bearer token */
  getAccessToken?: () => Promise<string | null> | string | null;
  /** fetch 实现（测试注入 vi.fn） */
  fetchImpl?: typeof fetch;
  /** 读取音频 blob（测试可跳过真实 IndexedDB） */
  getAudioBlob?: (id: string) => Promise<{ pcmData: ArrayBuffer; duration: number } | null>;
  /**
   * 获取当前 session 所属 user id。C2：
   * 用于跨账号隔离——若 capture.userId 与当前 subject 不一致，
   * 拒绝推送（避免 A 用户的离线 capture 被 B 用户 token 推到 B 账号上）。
   */
  getCurrentUserId?: () => string | null;
  /**
   * M1：步骤 1（POST /records）成功后立即回写 serverId 到本地 captureStore。
   * 这样即使步骤 2（/retry-audio）失败，下次重试也能跳过步骤 1，直接重试音频上传。
   */
  persistServerId?: (localId: string, serverId: string) => Promise<void>;
}

// ──────────────────────────────────────────────────────────────
// 工具：统一错误生成
// ──────────────────────────────────────────────────────────────

function toPushError(status: number | undefined, code: string, message: string) {
  const e: { status?: number; code: string; message: string } = { code, message };
  if (status !== undefined) e.status = status;
  return e;
}

function classifyHttpStatus(status: number, body: string): { code: string; message: string } {
  if (status === 401) return { code: "auth", message: `401 Unauthorized: ${body || "token invalid"}` };
  if (status === 403) return { code: "forbidden", message: `403 Forbidden: ${body}` };
  if (status === 400 || status === 422) return { code: "bad_request", message: `${status}: ${body}` };
  // 5xx / 其他 → 归为网络类，允许重试
  return { code: "network", message: `HTTP ${status}: ${body}` };
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    // 尝试从 JSON 里提取 error 字段
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") return parsed.error;
    } catch { /* not JSON */ }
    return text.slice(0, 200);
  } catch {
    return "";
  }
}

// ──────────────────────────────────────────────────────────────
// 主函数：工厂式，返回 (c) => Promise<{serverId}>
// ──────────────────────────────────────────────────────────────

/** 创建一个 pushCapture 函数，允许注入 deps 便于测试。 */
export function createPushCapture(deps: PushCaptureDeps = {}) {
  const getBase = deps.getGatewayBase ?? defaultGetGatewayBase;
  const getToken = deps.getAccessToken ?? defaultGetAccessToken;
  const fetchImpl: typeof fetch =
    deps.fetchImpl ?? ((...args) => (globalThis as { fetch: typeof fetch }).fetch(...args));
  const getAudioBlob = deps.getAudioBlob ?? ((id: string) => captureStore.getAudioBlob(id));
  const getCurrentUserId = deps.getCurrentUserId ?? defaultGetCurrentUserId;
  const persistServerId =
    deps.persistServerId ??
    (async (localId: string, serverId: string) => {
      try {
        await captureStore.update(localId, { serverId });
      } catch {
        // capture 可能已被删除 → 忽略
      }
    });

  return async function pushCapture(c: CaptureRecord): Promise<PushResult> {
    // C2：subject 校验——跨账号污染防护
    const currentSubject = getCurrentUserId();
    if (c.userId !== null && currentSubject !== null && c.userId !== currentSubject) {
      throw toPushError(
        undefined,
        "subject_mismatch",
        `capture owner ${c.userId} != current ${currentSubject}`,
      );
    }

    // Phase 4 只接入 diary；其余类型让 sync-orchestrator 走 bad_request 跳过
    if (c.kind !== "diary") {
      throw toPushError(undefined, "not_implemented", `kind=${c.kind} not implemented in Phase 4`);
    }
    return pushDiary(c, { getBase, getToken, fetchImpl, getAudioBlob, persistServerId });
  };
}

interface ResolvedDeps {
  getBase: () => Promise<string> | string;
  getToken: () => Promise<string | null> | string | null;
  fetchImpl: typeof fetch;
  getAudioBlob: (id: string) => Promise<{ pcmData: ArrayBuffer; duration: number } | null>;
  persistServerId: (localId: string, serverId: string) => Promise<void>;
}

/**
 * Diary 推送流程：
 *   1. POST /api/v1/records（带 client_id / status=pending_retry / source=voice / duration）
 *   2. 若有 audioLocalId → 读 audio blob → addWavHeader → POST /api/v1/records/:id/retry-audio
 *
 * 注意：步骤 2 失败不影响幂等性——record 已经创建，下次重试 pushCapture 仍会命中
 * 同一 client_id 的 record，拿到相同 id，再次 POST /retry-audio 即可。
 */
async function pushDiary(c: CaptureRecord, deps: ResolvedDeps): Promise<PushResult> {
  const base = await Promise.resolve(deps.getBase());
  const token = await Promise.resolve(deps.getToken());
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // 1) 读音频 blob（若有）
  //    M5：读失败 / blob 为 null 但 audioLocalId 非空 → 视为 "audio_blob_missing"，
  //    record 仍以 pending_retry 状态创建，跳过 /retry-audio，调用方可留痕 lastError。
  let audioPcm: ArrayBuffer | null = null;
  let durationSec = 0;
  let audioBlobMissing = false;
  if (c.audioLocalId) {
    try {
      const blob = await deps.getAudioBlob(c.audioLocalId);
      if (blob) {
        audioPcm = blob.pcmData;
        durationSec = Math.round(blob.duration);
      } else {
        audioBlobMissing = true;
        console.warn(`[capture-push] audio blob missing for capture ${c.localId}`);
      }
    } catch (e) {
      // 读不到音频不代表推送失败——创建 pending_retry record 占位，标记缺失
      audioBlobMissing = true;
      console.warn(`[capture-push] audio blob missing for capture ${c.localId}`, e);
    }
  }

  // M1：若 serverId 已持久化（上一轮步骤 1 成功但步骤 2 失败），直接走重试音频流程
  let recordId = c.serverId ?? null;

  if (!recordId) {
    const recordPayload = {
      client_id: c.localId,
      source: "voice",
      // M5：只要 audioLocalId 存在，就以 pending_retry 身份创建（即使当前 blob 缺失，
      // 避免被误判为 "completed" 无音频记录）
      status: c.audioLocalId ? "pending_retry" : audioPcm ? "pending_retry" : "completed",
      duration_seconds: durationSec || undefined,
      notebook: c.notebook ?? undefined,
    };

    let res: Response;
    try {
      res = await deps.fetchImpl(`${base}/api/v1/records`, {
        method: "POST",
        headers,
        body: JSON.stringify(recordPayload),
      });
    } catch (e) {
      throw toPushError(undefined, "network", `fetch failed: ${(e as Error).message ?? String(e)}`);
    }

    if (!res.ok) {
      const body = await readErrorBody(res);
      const { code, message } = classifyHttpStatus(res.status, body);
      throw toPushError(res.status, code, message);
    }

    let created: { id?: string; client_id?: string | null };
    try {
      created = await res.json();
    } catch (e) {
      throw toPushError(undefined, "network", `invalid JSON from /records: ${(e as Error).message}`);
    }

    recordId = created.id ?? null;
    if (!recordId) {
      throw toPushError(undefined, "bad_request", "server did not return record id");
    }

    // M1：步骤 1 成功后立即持久化 serverId，使步骤 2 即使失败也不会导致重复的 /records 创建
    try {
      await deps.persistServerId(c.localId, recordId);
    } catch (e) {
      // persist 失败不应阻塞主流程，只记录警告
      console.warn(`[capture-push] persistServerId failed for ${c.localId}`, e);
    }
  }

  // 2) 若 audio blob 缺失 → 跳过音频上传，返回带 warning 的结果
  if (audioBlobMissing) {
    return { serverId: recordId, warning: "audio_blob_missing" };
  }

  // 3) 若有音频 → 上传 WAV
  if (audioPcm) {
    const wav = addWavHeader(audioPcm);
    const audioHeaders: Record<string, string> = {
      "Content-Type": "application/octet-stream",
    };
    if (token) audioHeaders["Authorization"] = `Bearer ${token}`;

    let audioRes: Response;
    try {
      audioRes = await deps.fetchImpl(`${base}/api/v1/records/${recordId}/retry-audio`, {
        method: "POST",
        headers: audioHeaders,
        body: wav,
      });
    } catch (e) {
      throw toPushError(undefined, "network", `audio upload failed: ${(e as Error).message}`);
    }

    if (!audioRes.ok) {
      // 409 Record already processed = 已经上传过（幂等）→ 视为成功
      if (audioRes.status === 409) {
        return { serverId: recordId };
      }
      const body = await readErrorBody(audioRes);
      const { code, message } = classifyHttpStatus(audioRes.status, body);
      throw toPushError(audioRes.status, code, `audio upload: ${message}`);
    }
  }

  return { serverId: recordId };
}

/** 默认导出：使用真实 gateway + auth 的 pushCapture */
export const pushCapture = createPushCapture();
