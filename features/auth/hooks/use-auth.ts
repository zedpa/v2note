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
import { registerUser, loginUser, logoutUser } from "@/shared/lib/api/auth";
import { getDeviceId } from "@/shared/lib/device";
import { setApiDeviceId } from "@/shared/lib/api";
import type { AppUser } from "@/shared/lib/types";
import { toast } from "sonner";

export function useAuth() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initAuth().then(() => {
      setLoggedIn(checkLoggedIn());
      setUser(getCurrentUser());
      setLoading(false);
    });
  }, []);

  // 监听来自 API 层 / gateway-client 的被动登出事件
  useEffect(() => {
    return onAuthEvent("auth:logout", (reason) => {
      setLoggedIn(false);
      setUser(null);
      if (reason === "token_expired") {
        toast.error("登录已过期，请重新登录");
      } else if (reason === "ws_auth_failed") {
        toast.error("连接认证失败，请重新登录");
      }
    });
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const result = await loginUser(phone, password, deviceId);
      await saveAuthTokens(result);
      setApiDeviceId(deviceId);
      setLoggedIn(true);
      setUser({
        id: result.user.id,
        phone: result.user.phone,
        displayName: result.user.displayName,
        createdAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err.message ?? "登录失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (phone: string, password: string, displayName?: string) => {
    setError(null);
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const result = await registerUser(phone, password, deviceId, displayName);
      await saveAuthTokens(result);
      setApiDeviceId(deviceId);
      setLoggedIn(true);
      setUser({
        id: result.user.id,
        phone: result.user.phone,
        displayName: result.user.displayName,
        createdAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err.message ?? "注册失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // 场景 1 & 2: 调后端撤销 refresh token，失败也不阻塞本地清除
    const rt = getRefreshTokenValue();
    if (rt) {
      try {
        await logoutUser(rt);
      } catch {
        // 网络失败时静默忽略，refresh token 会自然过期（30天 TTL）
      }
    }
    await doLogout();
    setLoggedIn(false);
    setUser(null);
  }, []);

  return { loggedIn, user, loading, error, login, register, logout };
}
