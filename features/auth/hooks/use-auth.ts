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
import { getDeviceId } from "@/shared/lib/device";
import { setApiDeviceId } from "@/shared/lib/api";
import type { AppUser } from "@/shared/lib/types";
import { fabNotify } from "@/shared/lib/fab-notify";

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
  }, []);

  // 手机号登录
  const login = useCallback(async (phone: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const result = await loginUser(phone, password, deviceId);
      await saveAuthTokens(result);
      setApiDeviceId(deviceId);
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
      const deviceId = await getDeviceId();
      const result = await loginWithEmail(email, password, deviceId);
      await saveAuthTokens(result);
      setApiDeviceId(deviceId);
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
      const deviceId = await getDeviceId();
      const result = await registerUser(phone, password, deviceId, displayName);
      await saveAuthTokens(result);
      setApiDeviceId(deviceId);
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
      const deviceId = await getDeviceId();
      const result = await registerWithEmail(email, verificationToken, password, deviceId, displayName);
      await saveAuthTokens(result);
      setApiDeviceId(deviceId);
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
    const rt = getRefreshTokenValue();
    if (rt) {
      try { await logoutUser(rt); } catch { /* 网络失败静默忽略 */ }
    }
    await doLogout();
    setLoggedIn(false);
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loggedIn, user, loading, error, login, loginEmail, register, registerEmail, logout, clearError };
}
