"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerificationCodeInput } from "./verification-code-input";
import { sendEmailCode, verifyEmailCode, resetPassword } from "@/shared/lib/api/auth";

type Step = "email" | "verify" | "reset" | "done";

interface ForgotPasswordProps {
  onBack: () => void;
}

function getPasswordStrength(pw: string): "none" | "weak" | "medium" | "strong" {
  if (!pw) return "none";
  if (pw.length < 6) return "weak";
  if (pw.length >= 10 && /[A-Z]/.test(pw) && /\d/.test(pw)) return "strong";
  if (pw.length >= 8 && (/[A-Za-z]/.test(pw) && /\d/.test(pw))) return "medium";
  return "weak";
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.length > 1 ? local[0] + "***" : local;
  return `${masked}@${domain}`;
}

export function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [resendCountdown, setResendCountdown] = useState(0);

  const strength = getPasswordStrength(password);
  const isValidEmail = !email || EMAIL_REGEX.test(email);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      setError("请输入正确的邮箱地址");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await sendEmailCode(email.trim(), "reset_password");
      setStep("verify");
      setCountdown(300);
      setResendCountdown(60);
    } catch (err: any) {
      setError(err.message ?? "发送失败");
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleVerifyCode = useCallback(async (code: string) => {
    setCodeError(null);
    setLoading(true);
    try {
      const result = await verifyEmailCode(email.trim(), code, "reset_password");
      setVerificationToken(result.verificationToken);
      setStep("reset");
    } catch (err: any) {
      setCodeError(err.message ?? "验证码错误");
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleResendCode = useCallback(async () => {
    setCodeError(null);
    setLoading(true);
    try {
      await sendEmailCode(email.trim(), "reset_password");
      setCountdown(300);
      setResendCountdown(60);
    } catch (err: any) {
      setCodeError(err.message ?? "发送失败");
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleResetPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email.trim(), verificationToken, password);
      setStep("done");
    } catch (err: any) {
      setError(err.message ?? "重置失败");
    } finally {
      setLoading(false);
    }
  }, [email, verificationToken, password, confirmPassword]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const inputClass =
    "w-full h-12 px-4 rounded-xl bg-surface-lowest text-on-surface text-base outline-none placeholder:text-muted-accessible/50 focus:ring-2 focus:ring-deer/30";

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-surface">
      <div className="w-full max-w-sm space-y-8">
        {/* 顶部返回 */}
        <button
          type="button"
          onClick={step === "done" ? onBack : step === "reset" ? () => setStep("email") : onBack}
          className="flex items-center gap-1 text-sm text-muted-accessible"
        >
          <ArrowLeft className="h-4 w-4" />
          {step === "done" ? "返回登录" : "返回"}
        </button>

        {/* Step 1: 输入邮箱 */}
        {step === "email" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-medium text-on-surface">忘记密码</h2>
              <p className="text-sm text-muted-accessible">请输入注册时使用的邮箱，我们将发送验证码</p>
            </div>

            <input
              type="email"
              placeholder="邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
              className={inputClass}
            />
            {email && !isValidEmail && (
              <p className="text-xs text-maple">请输入正确的邮箱地址</p>
            )}

            {error && <p className="text-sm text-maple text-center">{error}</p>}

            <button
              type="button"
              onClick={handleSendCode}
              className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
              disabled={loading || !email.trim() || !isValidEmail}
            >
              {loading ? "发送中..." : "发送验证码"}
            </button>
          </div>
        )}

        {/* Step 2: 输入验证码 */}
        {step === "verify" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-medium text-on-surface">输入验证码</h2>
              <p className="text-sm text-muted-accessible">已发送到 {maskEmail(email)}</p>
            </div>

            <VerificationCodeInput
              onComplete={handleVerifyCode}
              error={codeError}
              disabled={loading}
            />

            {codeError && <p className="text-sm text-maple text-center">{codeError}</p>}

            <div className="text-center space-y-2">
              {countdown > 0 && (
                <p className="text-xs text-muted-accessible">
                  验证码 {formatTime(countdown)} 后过期
                </p>
              )}
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCountdown > 0 || loading}
                className="text-xs text-antler hover:underline disabled:text-muted-accessible disabled:no-underline"
              >
                {resendCountdown > 0 ? `重新发送 (${resendCountdown}s)` : loading ? "发送中..." : "重新发送验证码"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 设置新密码 */}
        {step === "reset" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-xl font-medium text-on-surface">设置新密码</h2>
            </div>

            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="新密码（至少 6 位）"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
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

            <input
              type={showPassword ? "text" : "password"}
              placeholder="确认新密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              className={inputClass}
            />

            {error && <p className="text-sm text-maple text-center">{error}</p>}

            <button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
              disabled={loading || !password.trim() || !confirmPassword.trim()}
            >
              {loading ? "重置中..." : "重置密码"}
            </button>
          </form>
        )}

        {/* Step 4: 完成 */}
        {step === "done" && (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <span className="text-3xl">&#10003;</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-medium text-on-surface">密码重置成功</h2>
              <p className="text-sm text-muted-accessible">请使用新密码登录</p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="w-full h-12 rounded-xl text-base font-medium text-white"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            >
              返回登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
