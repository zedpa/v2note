"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { LuluLogo } from "@/components/brand/lulu-logo";

type LoginMethod = "phone" | "email";

interface LoginPageProps {
  onLogin: (phone: string, password: string) => Promise<void>;
  onLoginWithEmail: (email: string, password: string) => Promise<void>;
  onSwitchToRegister: () => void;
  onForgotPassword: () => void;
  error?: string | null;
  loading?: boolean;
}

function getLastPhone(): string {
  try { return localStorage.getItem("voicenote:lastPhone") ?? ""; } catch { return ""; }
}

function getLastEmail(): string {
  try { return localStorage.getItem("voicenote:lastEmail") ?? ""; } catch { return ""; }
}

function getLastLoginMethod(): LoginMethod {
  try { return (localStorage.getItem("voicenote:lastLoginMethod") as LoginMethod) ?? "phone"; } catch { return "phone"; }
}

function getAutoLogin(): boolean {
  try { return localStorage.getItem("voicenote:autoLogin") !== "0"; } catch { return true; }
}

function getRememberPassword(): boolean {
  try { return localStorage.getItem("voicenote:rememberPassword") === "1"; } catch { return false; }
}

function getSavedPassword(): string {
  try { return localStorage.getItem("voicenote:savedPassword") ?? ""; } catch { return ""; }
}

export function LoginPage({ onLogin, onLoginWithEmail, onSwitchToRegister, onForgotPassword, error, loading }: LoginPageProps) {
  const [method, setMethod] = useState<LoginMethod>(getLastLoginMethod);
  const [phone, setPhone] = useState(getLastPhone);
  const [email, setEmail] = useState(getLastEmail);
  const [rememberPwd, setRememberPwd] = useState(getRememberPassword);
  const [password, setPassword] = useState(() => rememberPwd ? getSavedPassword() : "");
  const [showPassword, setShowPassword] = useState(false);
  const [autoLogin, setAutoLogin] = useState(getAutoLogin);
  const [failCount, setFailCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (method === "phone" && !phone.trim()) return;
    if (method === "email" && !email.trim()) return;
    if (!password.trim()) return;

    setSubmitting(true);
    try {
      localStorage.setItem("voicenote:autoLogin", autoLogin ? "1" : "0");
      localStorage.setItem("voicenote:rememberPassword", rememberPwd ? "1" : "0");
      if (rememberPwd) {
        localStorage.setItem("voicenote:savedPassword", password);
      } else {
        localStorage.removeItem("voicenote:savedPassword");
      }
      if (method === "email") {
        await onLoginWithEmail(email.trim(), password);
        try { localStorage.setItem("voicenote:lastEmail", email.trim()); } catch {}
      } else {
        await onLogin(phone.trim(), password);
      }
      try { localStorage.setItem("voicenote:lastLoginMethod", method); } catch {}
    } catch {
      setFailCount((c) => c + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMethodSwitch = (m: LoginMethod) => {
    setMethod(m);
    if (!rememberPwd) setPassword("");
    setLocalError(null);
  };

  const isLoading = loading || submitting;
  const displayError = localError || error;

  const inputClass =
    "w-full h-12 px-4 rounded-xl bg-surface-lowest text-on-surface text-base outline-none placeholder:text-muted-accessible/50 focus:ring-2 focus:ring-deer/30";

  const canSubmit = method === "phone"
    ? phone.trim() && password.trim()
    : email.trim() && password.trim();

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

        {/* Tab 切换 */}
        <div className="flex rounded-xl bg-surface-lowest p-1">
          {(["phone", "email"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleMethodSwitch(m)}
              className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                method === m
                  ? "bg-surface text-on-surface font-medium shadow-sm"
                  : "text-muted-accessible"
              }`}
            >
              {m === "phone" ? "手机号" : "邮箱"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {method === "phone" ? (
            <input
              type="tel"
              name="phone"
              placeholder="手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isLoading}
              autoComplete="tel"
              className={inputClass}
            />
          ) : (
            <input
              type="email"
              name="email"
              placeholder="邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoComplete="email"
              className={inputClass}
            />
          )}

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

          {/* 记住密码 + 自动登录 + 忘记密码 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberPwd}
                  onChange={(e) => setRememberPwd(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-deer"
                />
                <span className="text-xs text-muted-accessible">记住密码</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoLogin}
                  onChange={(e) => setAutoLogin(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-deer"
                />
                <span className="text-xs text-muted-accessible">自动登录</span>
              </label>
            </div>
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-xs text-antler hover:underline"
            >
              忘记密码？
            </button>
          </div>

          {displayError && (
            <p className="text-sm text-maple text-center">{displayError}</p>
          )}

          {failCount >= 3 && (
            <p className="text-xs text-muted-accessible text-center">
              多次登录失败？试试邮箱重置密码
            </p>
          )}

          <button
            type="submit"
            className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            disabled={isLoading || !canSubmit}
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
