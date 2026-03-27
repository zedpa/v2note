"use client";

import { useState } from "react";
import { LuluLogo } from "@/components/brand/lulu-logo";

interface RegisterPageProps {
  onRegister: (phone: string, password: string, displayName?: string) => Promise<void>;
  onSwitchToLogin: () => void;
  error?: string | null;
  loading?: boolean;
}

export function RegisterPage({ onRegister, onSwitchToLogin, error, loading }: RegisterPageProps) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!phone.trim() || !password.trim()) return;
    if (password !== confirmPassword) {
      setLocalError("两次密码不一致");
      return;
    }
    if (password.length < 6) {
      setLocalError("密码至少 6 位");
      return;
    }

    setSubmitting(true);
    try {
      await onRegister(phone.trim(), password, displayName.trim() || undefined);
    } catch {
      // error handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = loading || submitting;
  const displayError = localError || error;

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
          <h1 className="font-serif text-2xl text-on-surface">创建账号</h1>
          <p className="text-sm text-muted-accessible">注册后可跨设备同步数据</p>
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
          <input
            type="text"
            placeholder="昵称（选填）"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={isLoading}
            autoComplete="name"
            className={inputClass}
          />
          <input
            type="password"
            placeholder="密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            className={inputClass}
          />
          <input
            type="password"
            placeholder="确认密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            className={inputClass}
          />

          {displayError && (
            <p className="text-sm text-maple text-center">{displayError}</p>
          )}

          <button
            type="submit"
            className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            disabled={isLoading || !phone.trim() || !password.trim() || !confirmPassword.trim()}
          >
            {isLoading ? "注册中..." : "注册"}
          </button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-sm text-antler hover:underline"
          >
            已有账号？直接登录
          </button>
        </div>
      </div>
    </div>
  );
}
