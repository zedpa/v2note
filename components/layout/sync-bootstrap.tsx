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
import { pushCapture } from "@/shared/lib/capture-push";

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

export function SyncBootstrap() {
  useEffect(() => {
    const stop = startSyncOrchestrator({
      refreshAuth,
      ensureWs,
      pushCapture,
    });

    // 新捕获事件：captureStore.create 后外部发的触发信号（Phase 4 只有 FAB 路径，
    // FAB 自己调 triggerSync；此监听器给未来 ChatView 等扩展点用）
    const onCaptureCreated = () => {
      import("@/shared/lib/sync-orchestrator").then(({ triggerSync }) => triggerSync());
    };
    if (typeof window !== "undefined") {
      window.addEventListener("capture:created", onCaptureCreated);
    }

    return () => {
      stop();
      if (typeof window !== "undefined") {
        window.removeEventListener("capture:created", onCaptureCreated);
      }
    };
  }, []);

  return null;
}
