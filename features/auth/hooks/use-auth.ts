"use client";

import { useState, useCallback, useEffect } from "react";
import {
  initAuth,
  isLoggedIn as checkLoggedIn,
  getCurrentUser,
  saveAuthTokens,
  logout as doLogout,
  getRefreshTokenValue,
  onAuthEvent,
} from "@/shared/lib/auth";
import { registerUser, loginUser, logoutUser, registerWithEmail, loginWithEmail } from "@/shared/lib/api/auth";
import type { AppUser } from "@/shared/lib/types";
import { fabNotify } from "@/shared/lib/fab-notify";
import { claimGuestCapturesOnLogin } from "@/shared/lib/guest-claim";
import { captureStore } from "@/shared/lib/capture-store";
import { flushAllUnsynced } from "@/shared/lib/sync-orchestrator";
import {
  decideLogoutAction,
  buildLogoutConfirmMessage,
} from "@/shared/lib/logout-flow";

/**
 * Phase 8 feature flag —— 默认关闭，等 Phase 8.1 修完对抗审查 P0 后再打开。
 *
 * 未修复的 P0 风险（详见审查报告）：
 *   - C1/C2：跨真实自然人登录的归属污染（logout 不清 guestBatchId + claim 缺 lastUserId 校验）
 *   - C3：capture-push.ts 的 currentSubject===null 放行漏洞（pre-existing from Phase 5）
 *   - C4：Phase 1-7 的 userId=null && guestBatchId=null 永久僵尸条目
 *   - M1：use-chat / fab 的 userIdRef 对 auth 变化无响应
 *   - M2：window.confirm 不可用时静默放行
 *
 * 关闭 claim 时：
 *   - guest captures 继续以 guestBatchId 落本地（为未来启用预留 schema）
 *   - 登录后不触发 claim，guest 数据保持本地 captured 状态
 *   - 无跨账号数据归属风险
 *
 * 登出 flush 路径（§4.3a）保持启用——它只处理当前登录用户自己的 userId != null 条目，
 * 不涉及跨账号归属。
 */
const ENABLE_GUEST_CLAIM_ON_LOGIN = false;

export function useAuth() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initAuth().then(async () => {
      // 检查是否新开浏览器会话（sessionStorage 在关闭浏览器后清空）
      const sessionAlive = sessionStorage.getItem("voicenote:sessionAlive");
      const autoLogin = localStorage.getItem("voicenote:autoLogin") !== "0";

      if (!sessionAlive && !autoLogin && checkLoggedIn()) {
        // 新会话 + 未勾选自动登录 → 清除登录态，要求重新登录
        await doLogout();
        setLoggedIn(false);
        setUser(null);
      } else {
        setLoggedIn(checkLoggedIn());
        setUser(getCurrentUser());
      }

      // 标记当前浏览器会话存活（同一 tab/窗口内刷新不会清除）
      sessionStorage.setItem("voicenote:sessionAlive", "1");
      setLoading(false);
    });
  }, []);

  // 监听来自 API 层 / gateway-client 的被动登出事件
  useEffect(() => {
    return onAuthEvent("auth:logout", (reason) => {
      setLoggedIn(false);
      setUser(null);
      if (reason === "token_expired") {
        fabNotify.error("登录已过期，请重新登录");
      } else if (reason === "ws_auth_failed") {
        fabNotify.error("连接认证失败，请重新登录");
      }
    });
  }, []);

  const setLoggedInUser = useCallback((result: { user: { id: string; phone: string | null; email: string | null; displayName: string | null } }) => {
    setLoggedIn(true);
    setUser({
      id: result.user.id,
      phone: result.user.phone,
      email: result.user.email,
      displayName: result.user.displayName,
      avatarUrl: null,
      createdAt: new Date().toISOString(),
    });

    // Phase 8（spec §4.3）：登录成功后把 guest 批次的本地条目归属到真实账号；
    // 若检测到"上一个账号"的孤儿条目 → 交由 UI 提示用户（此处用 fabNotify 降级，
    // 本期不阻塞登录流程；完整的三选一弹窗留待后续 UI 迭代）。
    // 调用是"尽力而为"——失败不影响登录态。
    claimGuestCapturesOnLogin({ userId: result.user.id })
      .then((res) => {
        if (res.claimed > 0) {
          fabNotify.info(`已同步 ${res.claimed} 条离线记录`);
        }
        if (res.conflict.length > 0) {
          // 降级：暂时提示用户；未来 UI 可展开三选一弹窗
          fabNotify.info(
            `检测到 ${res.conflict.length} 条未同步记录属于上一个账号，保留在本设备`,
          );
        }
      })
      .catch(() => {
        // 静默忽略——用户的离线数据不会因 claim 失败丢失（仍在 captureStore）
      });
  }, []);

  // 手机号登录
  const login = useCallback(async (phone: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await loginUser(phone, password);
      await saveAuthTokens(result);
      try { localStorage.setItem("voicenote:lastPhone", phone); } catch { /* ignore */ }
      setLoggedInUser(result);
    } catch (err: any) {
      setError(err.message ?? "登录失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoggedInUser]);

  // 邮箱登录
  const loginEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await loginWithEmail(email, password);
      await saveAuthTokens(result);
      try { localStorage.setItem("voicenote:lastEmail", email); } catch { /* ignore */ }
      setLoggedInUser(result);
    } catch (err: any) {
      setError(err.message ?? "登录失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoggedInUser]);

  // 手机号注册
  const register = useCallback(async (phone: string, password: string, displayName?: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await registerUser(phone, password, displayName);
      await saveAuthTokens(result);
      try { localStorage.setItem("voicenote:lastPhone", phone); } catch { /* ignore */ }
      setLoggedInUser(result);
    } catch (err: any) {
      setError(err.message ?? "注册失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoggedInUser]);

  // 邮箱注册
  const registerEmail = useCallback(async (email: string, verificationToken: string, password: string, displayName?: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await registerWithEmail(email, verificationToken, password, displayName);
      await saveAuthTokens(result);
      try { localStorage.setItem("voicenote:lastEmail", email); } catch { /* ignore */ }
      setLoggedInUser(result);
    } catch (err: any) {
      setError(err.message ?? "注册失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoggedInUser]);

  const logout = useCallback(async () => {
    // Phase 8（spec §4.3a）：登出前处理未同步条目
    //   1. 统计 userId !== null 的未同步条目数
    //   2. 若存在 → 阻塞最多 5s 尝试 flush
    //   3. 根据结果 + 用户确认决定是否登出
    //   4. **禁止**静默丢弃未同步条目（captureStore 保留本地数据）
    try {
      setLoading(true);

      const initialUnsynced = (await captureStore.listUnsynced().catch(() => []))
        .filter((c) => c.userId !== null);

      if (initialUnsynced.length > 0) {
        // 尝试全量推送（最多 5s）
        const { timedOut } = await flushAllUnsynced(5000);

        // 再统计一次 unsynced（flush 后可能清零）
        const stillUnsynced = (await captureStore.listUnsynced().catch(() => []))
          .filter((c) => c.userId !== null);

        const online = typeof navigator !== "undefined" ? navigator.onLine : true;
        const decision = decideLogoutAction({
          userOwnedUnsyncedCount: stillUnsynced.length,
          online,
          flushTimedOut: timedOut,
        });

        if (decision.action === "block") {
          // 弹确认：降级到 window.confirm（未来可替换为受控 Modal）
          const msg = buildLogoutConfirmMessage(decision.unsyncedCount);
          const confirmed =
            typeof window !== "undefined" &&
            typeof window.confirm === "function"
              ? window.confirm(msg)
              : true; // 非浏览器环境静默通过
          if (!confirmed) {
            setLoading(false);
            return;
          }
          // 用户确认 → 二次 decideLogoutAction 以记录选择
          const finalDecision = decideLogoutAction({
            userOwnedUnsyncedCount: decision.unsyncedCount,
            online,
            flushTimedOut: timedOut,
            userChoice: "confirm",
          });
          if (finalDecision.action !== "proceed") {
            setLoading(false);
            return;
          }
        }
      }

      // 正常登出流程
      const rt = getRefreshTokenValue();
      if (rt) {
        try { await logoutUser(rt); } catch { /* 网络失败静默忽略 */ }
      }
      await doLogout();
      setLoggedIn(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loggedIn, user, loading, error, login, loginEmail, register, registerEmail, logout, clearError };
}
