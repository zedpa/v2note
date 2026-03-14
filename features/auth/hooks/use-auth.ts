"use client";

import { useState, useCallback, useEffect } from "react";
import {
  initAuth,
  isLoggedIn as checkLoggedIn,
  getCurrentUser,
  saveAuthTokens,
  logout as doLogout,
} from "@/shared/lib/auth";
import { registerUser, loginUser } from "@/shared/lib/api/auth";
import { getDeviceId } from "@/shared/lib/device";
import { setApiDeviceId } from "@/shared/lib/api";
import type { AppUser } from "@/shared/lib/types";

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
    await doLogout();
    setLoggedIn(false);
    setUser(null);
  }, []);

  return { loggedIn, user, loading, error, login, register, logout };
}
