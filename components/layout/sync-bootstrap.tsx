"use client";

/**
 * SyncBootstrap — 在全局布局挂载时启动本地捕获同步调度器。
 *
 * regression: fix-cold-resume-silent-loss (Phase 4.2)
 *
 * 职责：
 *   - 注入 refreshAuth（复用 shared/lib/api.ts 的 refresh 机制）
 *   - 注入 ensureWs（调用 gateway-client.connect + waitForReady）
 *   - 注入 pushCapture（shared/lib/capture-push.ts 默认实现）
 *
 * 注意：此组件不渲染任何 DOM；仅在 useEffect 中挂载，unmount 时清理。
 */

import { useEffect } from "react";
import {
  startSyncOrchestrator,
  type SyncOrchestratorOptions,
} from "@/shared/lib/sync-orchestrator";
import {
  showQuickCaptureNotification,
  hideQuickCaptureNotification,
} from "@/features/capture/lib/persistent-notification";
import {
  startFloatingBubble,
  checkOverlayPermission,
  onRecordingComplete,
} from "@/features/capture/lib/floating-capture";
import { createPushCapture, type ChatPushClient } from "@/shared/lib/capture-push";
// §8：静态导入以便在 startSyncOrchestrator 调用点同步注入 subscribeWsStatus /
// getCurrentWsStatus。gateway-client 是纯 class + 单例懒加载，无 side effect，
// 静态导入安全（其他位置如 ensureWs / getChatClient 仍保留动态 import 以
// 避免 diff 外溢）。
import { getGatewayClient } from "@/features/chat/lib/gateway-client";

async function refreshAuth(): ReturnType<SyncOrchestratorOptions["refreshAuth"]> {
  try {
    const auth = await import("@/shared/lib/auth");
    const rt = auth.getRefreshTokenValue();
    if (!rt) {
      // 未登录 → 返回 ok:true + subject:null 表示"本地模式 OK"
      return { ok: true, subject: null };
    }
    const { refreshToken } = await import("@/shared/lib/api/auth");
    const result = await refreshToken(rt);
    await auth.updateTokens(result.accessToken, result.refreshToken);
    const user = auth.getCurrentUser();
    return { ok: true, subject: user?.id ?? null };
  } catch {
    return { ok: false };
  }
}

async function ensureWs(): Promise<boolean> {
  try {
    const { getGatewayClient } = await import("@/features/chat/lib/gateway-client");
    const client = getGatewayClient();
    if (client.connected) return true;
    client.connect();
    return await client.waitForReady(8000);
  } catch {
    return false;
  }
}

/**
 * Phase 5：构造带 gateway client 注入的 pushCapture。
 * 真实 gateway-client 实现了 ChatPushClient 接口（connected/send/onceResponse）。
 */
async function getChatClient(): Promise<ChatPushClient> {
  const { getGatewayClient } = await import("@/features/chat/lib/gateway-client");
  return getGatewayClient() as unknown as ChatPushClient;
}

const pushCapture = createPushCapture({ getChatClient });

export function SyncBootstrap() {
  useEffect(() => {
    const stop = startSyncOrchestrator({
      refreshAuth,
      ensureWs,
      pushCapture,
      // §8：懒绑定需要知道当前登录用户以回填 userId。
      // 使用动态 import 避免 auth 模块的静态导入改变加载顺序。
      getCurrentUser: () => {
        // auth 模块在 initAuth() 前已被 refreshAuth / useAuth 加载，
        // require 此处一定返回已缓存的模块。
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const auth = require("@/shared/lib/auth");
          return auth.getCurrentUser();
        } catch {
          return null;
        }
      },
      // §8：订阅 gateway WS 状态（非 open → open 边沿触发 triggerSync），
      // 修复 WS 首次 OPEN 时无触发点导致的"冷启动 lazy-bind 完成但无推送"死锁。
      subscribeWsStatus: (handler) => {
        const client = getGatewayClient();
        return client.onStatusChange(handler);
      },
      // §8 B2：读取订阅注册时刻的 WS 状态，用于初始化 lastWsStatus。
      // onStatusChange 不回放当前状态，若不初始化会错过订阅前已发生的 open 边沿。
      getCurrentWsStatus: () => {
        const client = getGatewayClient();
        return client.getStatus();
      },
    });

    // §7.7 冷启动恢复：显式调用 initAuth 并在完成后置 __authReady 标志。
    // E2E 通过轮询 window.__authReady === true 断言 auth 已恢复。
    // initAuth 成功重建 user 时会派发 auth:user-changed(reason="restored")，
    // 由 sync-orchestrator 监听触发懒绑定扫描。
    let cancelled = false;
    (async () => {
      try {
        const auth = await import("@/shared/lib/auth");
        await auth.initAuth();
      } catch {
        // initAuth 失败不阻塞同步调度器主流程
      } finally {
        if (!cancelled && typeof window !== "undefined") {
          (window as unknown as { __authReady?: boolean }).__authReady = true;
        }
      }
      // Spec #131 B3: 悬浮气泡自动恢复 — 必须在 initAuth 之后执行，
      // 否则 _currentUserId 为 null，getSettings() 读全局 key 而非用户 key，
      // 导致 floatingBubble 始终为 false。
      if (!cancelled) {
        try {
          const { getSettings } = await import("@/shared/lib/local-config");
          const settings = await getSettings();
          if (settings.floatingBubble) {
            const granted = await checkOverlayPermission();
            if (granted) {
              await startFloatingBubble();
            }
          }
        } catch {
          // 气泡恢复失败不阻塞主流程
        }
      }
    })();

    // §7.7：测试辅助挂载（仅 non-production）。E2E 通过这些入口断言 capture 的 userId 已回填。
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (async () => {
        try {
          const [{ captureStore }, { peekGuestBatchId }, { getCurrentUser }] =
            await Promise.all([
              import("@/shared/lib/capture-store"),
              import("@/shared/lib/guest-session"),
              import("@/shared/lib/auth"),
            ]);

          /**
           * §7.7 E2E 专用 put 适配器：直接向 IndexedDB 写入一条 capture，
           * 尊重调用方指定的 localId / createdAt / userId / guestBatchId，
           * 用于模拟"上一个 session 的遗留 / 未归属条目"。
           *
           * 此路径**不**经过 captureStore.create() 的 localId 生成与互斥校验，
           * 仅供 E2E 使用。production 构建下整个 if 块被 tree-shake。
           */
          const e2ePut = async (input: {
            localId: string;
            kind: "diary" | "chat" | "voice";
            text?: string | null;
            userId?: string | null;
            guestBatchId?: string | null;
            syncStatus?: string;
            createdAt?: number | string;
            audioLocalId?: string | null;
            sourceContext?: string;
            forceCommand?: boolean;
            notebook?: string | null;
          }): Promise<{ localId: string; guestBatchId: string | null }> => {
            // §7.7 E2E 自愈：注入 userId=null 但未提供 guestBatchId 的场景（模拟
            // "上一个 guest session 的遗留条目"），自动生成并持久化一个 batchId，
            // 让 sync-orchestrator 懒绑定（§7.2）能匹配 currentBatch 完成回填。
            let effectiveBatchId = input.guestBatchId ?? null;
            if (input.userId == null && !effectiveBatchId) {
              effectiveBatchId =
                localStorage.getItem("v2note-guest-batch-id") ?? null;
              if (!effectiveBatchId) {
                effectiveBatchId = `e2e-batch-${Date.now()}-${Math.random()
                  .toString(36)
                  .slice(2, 10)}`;
                localStorage.setItem("v2note-guest-batch-id", effectiveBatchId);
              }
            }
            return new Promise((resolve, reject) => {
              // DB 首次创建时 captureStore 可能尚未初始化过 —— 传版本号 + upgrade
              // 镜像 capture-store.ts 的 schema 以兜底。
              const req = indexedDB.open("v2note-capture", 1);
              req.onerror = () => reject(req.error);
              req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("captures")) {
                  const os = db.createObjectStore("captures", { keyPath: "localId" });
                  os.createIndex("syncStatus", "syncStatus", { unique: false });
                  os.createIndex("kind", "kind", { unique: false });
                  os.createIndex("createdAt", "createdAt", { unique: false });
                  os.createIndex("audioLocalId", "audioLocalId", { unique: false });
                  if (!os.indexNames.contains("by_kind")) {
                    os.createIndex("by_kind", "kind", { unique: false });
                  }
                }
                if (!db.objectStoreNames.contains("audio_blobs")) {
                  db.createObjectStore("audio_blobs", { keyPath: "id" });
                }
              };
              req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("captures")) {
                  reject(new Error("captures store not found"));
                  return;
                }
                const tx = db.transaction("captures", "readwrite");
                const store = tx.objectStore("captures");
                const record = {
                  localId: input.localId,
                  serverId: null,
                  kind: input.kind,
                  text: input.text ?? null,
                  audioLocalId: input.audioLocalId ?? null,
                  sourceContext: input.sourceContext ?? "timeline",
                  forceCommand: input.forceCommand ?? false,
                  notebook: input.notebook ?? null,
                  createdAt:
                    typeof input.createdAt === "number"
                      ? new Date(input.createdAt).toISOString()
                      : (input.createdAt ?? new Date().toISOString()),
                  userId: input.userId ?? null,
                  syncStatus: input.syncStatus ?? "captured",
                  lastError: null,
                  retryCount: 0,
                  syncingAt: null,
                  guestBatchId: effectiveBatchId,
                };
                const putReq = store.put(record);
                putReq.onsuccess = () =>
                  resolve({
                    localId: input.localId,
                    guestBatchId: effectiveBatchId,
                  });
                putReq.onerror = () => reject(putReq.error);
              };
            });
          };

          const w = window as unknown as {
            __captureStore?: typeof captureStore & { put: typeof e2ePut };
            __peekGuestBatchId?: typeof peekGuestBatchId;
            __getCurrentUser?: typeof getCurrentUser;
          };
          w.__captureStore = Object.assign({}, captureStore, { put: e2ePut });
          w.__peekGuestBatchId = peekGuestBatchId;
          w.__getCurrentUser = getCurrentUser;
        } catch {
          // 测试辅助挂载失败不应影响产品功能
        }
      })();
    }

    // 新捕获事件：captureStore.create 后外部发的触发信号（Phase 4 只有 FAB 路径，
    // FAB 自己调 triggerSync；此监听器给未来 ChatView 等扩展点用）
    const onCaptureCreated = () => {
      import("@/shared/lib/sync-orchestrator").then(({ triggerSync }) => triggerSync());
    };
    if (typeof window !== "undefined") {
      window.addEventListener("capture:created", onCaptureCreated);
    }

    // Spec #131: Deep Link — v2note://capture/* URL 路由
    // 方案 C: getLaunchUrl 只在首次 mount 调用一次（冷启动），
    // 热启动全靠 appUrlOpen 事件，彻底分离两条路径。
    let removeAppUrlListener: (() => void) | null = null;
    const navigateToCapture = (rawUrl: string) => {
      if (!rawUrl) return;
      const path = rawUrl.replace(/^v2note:\/\//, "/");
      if (!path.startsWith("/capture/")) return;
      // window.location.replace 不添加历史记录，避免循环返回
      window.location.replace(path);
    };
    (async () => {
      try {
        const { App } = await import("@capacitor/app");

        // 热启动：App 在前台时收到新 intent
        const listener = await App.addListener("appUrlOpen", (data) => {
          navigateToCapture(data.url);
        });
        removeAppUrlListener = () => listener.remove();

        // 冷启动：仅在首次 mount 时消费一次 launch URL
        // 用 sessionStorage flag 确保页面重载后不会重复消费
        const consumedKey = "v2note:launchUrlConsumed";
        if (!sessionStorage.getItem(consumedKey)) {
          const launchUrl = await App.getLaunchUrl();
          if (launchUrl?.url) {
            sessionStorage.setItem(consumedKey, "1");
            navigateToCapture(launchUrl.url);
          }
        }
      } catch {
        // Web 环境无 @capacitor/app，静默跳过
      }
    })();

    // Spec #131 B4: 悬浮气泡录音完成 → 读取 PCM → 写入 capture-store → 触发同步
    let removeBubbleListener: (() => void) | null = null;
    (async () => {
      try {
        const listener = await onRecordingComplete(async (data) => {
          try {
            const { Filesystem, Directory } = await import("@capacitor/filesystem");
            // 原生侧返回绝对路径如 /data/.../cache/capture_xxx.pcm
            // Filesystem.readFile 的 Directory.Cache 会拼接 cacheDir 前缀
            // 因此只传文件名部分
            const fileName = data.pcmFilePath.split("/").pop() ?? data.pcmFilePath;
            const result = await Filesystem.readFile({
              path: fileName,
              directory: Directory.Cache,
            });
            // base64 → ArrayBuffer
            const binary = atob(result.data as string);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const pcmData = bytes.buffer;

            // 写入 capture-store
            const { captureStore } = await import("@/shared/lib/capture-store");
            const auth = await import("@/shared/lib/auth");
            const user = auth.getCurrentUser();
            await captureStore.create({
              kind: "diary",
              text: null,
              audioLocalId: null,
              sourceContext: "floating_bubble",
              forceCommand: false,
              notebook: null,
              userId: user?.id ?? null,
              audioBlob: { pcmData, duration: data.durationMs },
            });

            // 触发同步
            const { triggerSync } = await import("@/shared/lib/sync-orchestrator");
            triggerSync();

            // 清理临时文件
            try {
              await Filesystem.deleteFile({
                path: fileName,
                directory: Directory.Cache,
              });
            } catch { /* 清理失败不阻塞 */ }
          } catch (err) {
            console.error("[FloatingCapture] Failed to process recording:", err);
          }
        });
        if (listener) {
          removeBubbleListener = () => listener.remove();
        }
      } catch { /* 非 Android 平台静默跳过 */ }
    })();

    // Spec #131 A1: 常驻通知 — App 可见时隐藏，不可见时根据设置显示
    const handleVisibility = async () => {
      try {
        const { getSettings } = await import("@/shared/lib/local-config");
        const settings = await getSettings();
        if (document.visibilityState === "hidden" && settings.quickCaptureNotification) {
          await showQuickCaptureNotification();
        } else if (document.visibilityState === "visible") {
          await hideQuickCaptureNotification();
        }
      } catch {
        // 通知操作失败不阻塞主流程
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      stop();
      if (typeof window !== "undefined") {
        window.removeEventListener("capture:created", onCaptureCreated);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      removeAppUrlListener?.();
      removeBubbleListener?.();
    };
  }, []);

  return null;
}
