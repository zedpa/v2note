"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo area */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="text-3xl">🎙</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">创建账号</h1>
          <p className="text-sm text-muted-foreground">注册后可跨设备同步数据</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="tel"
              placeholder="手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isLoading}
              autoComplete="tel"
              className="h-12 text-base"
            />
            <Input
              type="text"
              placeholder="昵称（选填）"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isLoading}
              autoComplete="name"
              className="h-12 text-base"
            />
            <Input
              type="password"
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              className="h-12 text-base"
            />
            <Input
              type="password"
              placeholder="确认密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              className="h-12 text-base"
            />
          </div>

          {displayError && (
            <p className="text-sm text-destructive text-center">{displayError}</p>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold"
            disabled={isLoading || !phone.trim() || !password.trim() || !confirmPassword.trim()}
          >
            {isLoading ? "注册中..." : "注册"}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-sm text-primary hover:underline"
          >
            已有账号？直接登录
          </button>
        </div>
      </div>
    </div>
  );
}
