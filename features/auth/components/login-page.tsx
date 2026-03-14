"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo area */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="text-3xl">🎙</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">VoiceNote</h1>
          <p className="text-sm text-muted-foreground">AI 个人助手</p>
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
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              className="h-12 text-base"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold"
            disabled={isLoading || !phone.trim() || !password.trim()}
          >
            {isLoading ? "登录中..." : "登录"}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-sm text-primary hover:underline"
          >
            没有账号？立即注册
          </button>
        </div>
      </div>
    </div>
  );
}
