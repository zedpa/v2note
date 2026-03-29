"use client";

import { useState } from "react";
import { LuluLogo } from "@/components/brand/lulu-logo";

interface LoginPageProps {
  onLogin: (phone: string, password: string) => Promise<void>;
  onSwitchToRegister: () => void;
  error?: string | null;
  loading?: boolean;
}

export function LoginPage({ onLogin, onSwitchToRegister, error, loading }: LoginPageProps) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password.trim()) return;
    setSubmitting(true);
    try {
      await onLogin(phone.trim(), password);
    } catch {
      // error handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = loading || submitting;

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
            className="w-full h-12 px-4 rounded-xl bg-surface-lowest text-on-surface text-base outline-none placeholder:text-muted-accessible/50 focus:ring-2 focus:ring-deer/30"
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="current-password"
            className="w-full h-12 px-4 rounded-xl bg-surface-lowest text-on-surface text-base outline-none placeholder:text-muted-accessible/50 focus:ring-2 focus:ring-deer/30"
          />

          {error && (
            <p className="text-sm text-maple text-center">{error}</p>
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
