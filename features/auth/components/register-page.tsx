"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { LuluLogo } from "@/components/brand/lulu-logo";
import { cn } from "@/lib/utils";

interface RegisterPageProps {
  onRegister: (phone: string, password: string, displayName?: string) => Promise<void>;
  onSwitchToLogin: () => void;
  error?: string | null;
  loading?: boolean;
}

function getPasswordStrength(pw: string): "none" | "weak" | "medium" | "strong" {
  if (!pw) return "none";
  if (pw.length < 6) return "weak";
  if (pw.length >= 10 && /[A-Z]/.test(pw) && /\d/.test(pw)) return "strong";
  if (pw.length >= 8 && (/[A-Za-z]/.test(pw) && /\d/.test(pw))) return "medium";
  return "weak";
}

const PHONE_REGEX = /^1[3-9]\d{9}$/;

export function RegisterPage({ onRegister, onSwitchToLogin, error, loading }: RegisterPageProps) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValidPhone = !phone || PHONE_REGEX.test(phone);
  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!phone.trim() || !password.trim()) return;
    if (!PHONE_REGEX.test(phone.trim())) {
      setLocalError("请输入正确的手机号");
      return;
    }
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
          <h1 className="font-serif text-3xl text-on-surface">创建账号</h1>
          <p className="text-sm text-muted-accessible">注册后可跨设备同步数据</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 手机号 + 格式校验 */}
          <div>
            <input
              type="tel"
              placeholder="手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhoneTouched(true)}
              disabled={isLoading}
              autoComplete="tel"
              className={inputClass}
            />
            {phoneTouched && phone && !isValidPhone && (
              <p className="mt-1 text-xs text-maple">请输入正确的手机号</p>
            )}
          </div>

          <input
            type="text"
            placeholder="昵称（选填）"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={isLoading}
            autoComplete="name"
            className={inputClass}
          />

          {/* 密码 + 显隐 + 强度条 */}
          <div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="密码（至少 6 位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="new-password"
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
            {/* 密码强度条 */}
            {strength !== "none" && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-surface-low overflow-hidden">
                  <div className={cn(
                    "h-full rounded-full transition-all duration-300",
                    strength === "weak" && "w-1/3 bg-maple",
                    strength === "medium" && "w-2/3 bg-deer",
                    strength === "strong" && "w-full bg-green-500",
                  )} />
                </div>
                <span className={cn(
                  "text-[10px]",
                  strength === "weak" && "text-maple",
                  strength === "medium" && "text-deer",
                  strength === "strong" && "text-green-500",
                )}>
                  {strength === "weak" ? "弱" : strength === "medium" ? "中" : "强"}
                </span>
              </div>
            )}
          </div>

          {/* 确认密码（共享 showPassword 状态） */}
          <input
            type={showPassword ? "text" : "password"}
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
            disabled={isLoading || !phone.trim() || !password.trim() || !confirmPassword.trim() || (phoneTouched && !isValidPhone)}
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
