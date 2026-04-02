"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { LuluLogo } from "@/components/brand/lulu-logo";

interface LoginPageProps {
  onLogin: (phone: string, password: string) => Promise<void>;
  onSwitchToRegister: () => void;
  error?: string | null;
  loading?: boolean;
}

function getLastPhone(): string {
  try { return localStorage.getItem("voicenote:lastPhone") ?? ""; } catch { return ""; }
}

function getAutoLogin(): boolean {
  try { return localStorage.getItem("voicenote:autoLogin") !== "0"; } catch { return true; }
}

export function LoginPage({ onLogin, onSwitchToRegister, error, loading }: LoginPageProps) {
  const [phone, setPhone] = useState(getLastPhone);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [autoLogin, setAutoLogin] = useState(getAutoLogin);
  const [failCount, setFailCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password.trim()) return;
    setSubmitting(true);
    try {
      // 存储自动登录偏好
      localStorage.setItem("voicenote:autoLogin", autoLogin ? "1" : "0");
      await onLogin(phone.trim(), password);
      // 登录成功，failCount 不需要重置（页面会切走）
    } catch {
      setFailCount((c) => c + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = loading || submitting;

  const inputClass =
    "w-full h-12 px-4 rounded-xl bg-surface-lowest text-on-surface text-base outline-none placeholder:text-muted-accessible/50 focus:ring-2 focus:ring-deer/30";

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-surface">
      <div className="w-full max-w-sm space-y-10">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto">
            <LuluLogo size={80} variant="color" className="animate-none" />
          </div>
          <h1 className="font-serif text-3xl text-on-surface">念念有路</h1>
          <p className="text-sm text-muted-accessible">你的每一个想法，我都帮你记住</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="tel"
            placeholder="手机号"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isLoading}
            autoComplete="tel"
            className={inputClass}
          />

          {/* 密码框 + 显隐切换 */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-accessible"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {/* 自动登录 */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoLogin}
              onChange={(e) => setAutoLogin(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-deer"
            />
            <span className="text-xs text-muted-accessible">自动登录</span>
          </label>

          {error && (
            <p className="text-sm text-maple text-center">{error}</p>
          )}

          {failCount >= 3 && (
            <p className="text-xs text-muted-accessible text-center">
              忘记密码？请联系客服或重新注册
            </p>
          )}

          <button
            type="submit"
            className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            disabled={isLoading || !phone.trim() || !password.trim()}
          >
            {isLoading ? "登录中..." : "登录"}
          </button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-sm text-antler hover:underline"
          >
            没有账号？立即注册
          </button>
        </div>
      </div>
    </div>
  );
}
