"use client";

import { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
import { LuluLogo } from "@/components/brand/lulu-logo";
import { cn } from "@/lib/utils";
import { VerificationCodeInput } from "./verification-code-input";
import { sendEmailCode, verifyEmailCode } from "@/shared/lib/api/auth";

type RegisterMethod = "phone" | "email";
type EmailStep = "input" | "verify" | "password";

interface RegisterPageProps {
  onRegister: (phone: string, password: string, displayName?: string) => Promise<void>;
  onRegisterWithEmail: (email: string, verificationToken: string, password: string, displayName?: string) => Promise<void>;
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
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.length > 1 ? local[0] + "***" : local;
  return `${masked}@${domain}`;
}

export function RegisterPage({ onRegister, onRegisterWithEmail, onSwitchToLogin, error, loading }: RegisterPageProps) {
  const [method, setMethod] = useState<RegisterMethod>("phone");

  // 手机号注册状态
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  // 邮箱注册状态
  const [email, setEmail] = useState("");
  const [emailStep, setEmailStep] = useState<EmailStep>("input");
  const [verificationToken, setVerificationToken] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [resendCountdown, setResendCountdown] = useState(0);

  // 共享状态
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValidPhone = !phone || PHONE_REGEX.test(phone);
  const isValidEmail = !email || EMAIL_REGEX.test(email);
  const strength = getPasswordStrength(password);

  // 验证码过期倒计时 (5 分钟)
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // 重新发送倒计时 (60 秒)
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      setLocalError("请输入正确的邮箱地址");
      return;
    }
    setLocalError(null);
    setSendingCode(true);
    try {
      await sendEmailCode(email.trim(), "register");
      setEmailStep("verify");
      setCountdown(300); // 5 分钟
      setResendCountdown(60);
    } catch (err: any) {
      setLocalError(err.message ?? "发送失败");
    } finally {
      setSendingCode(false);
    }
  }, [email]);

  const handleVerifyCode = useCallback(async (code: string) => {
    setCodeError(null);
    setVerifyingCode(true);
    try {
      const result = await verifyEmailCode(email.trim(), code, "register");
      setVerificationToken(result.verificationToken);
      setEmailStep("password");
    } catch (err: any) {
      setCodeError(err.message ?? "验证码错误");
    } finally {
      setVerifyingCode(false);
    }
  }, [email]);

  const handleResendCode = useCallback(async () => {
    setCodeError(null);
    setSendingCode(true);
    try {
      await sendEmailCode(email.trim(), "register");
      setCountdown(300);
      setResendCountdown(60);
    } catch (err: any) {
      setCodeError(err.message ?? "发送失败");
    } finally {
      setSendingCode(false);
    }
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

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
      if (method === "email") {
        await onRegisterWithEmail(email.trim(), verificationToken, password, displayName.trim() || undefined);
      } else {
        if (!PHONE_REGEX.test(phone.trim())) {
          setLocalError("请输入正确的手机号");
          setSubmitting(false);
          return;
        }
        await onRegister(phone.trim(), password, displayName.trim() || undefined);
      }
    } catch {
      // error handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  const handleMethodSwitch = (m: RegisterMethod) => {
    setMethod(m);
    setLocalError(null);
    setPassword("");
    setConfirmPassword("");
    if (m === "email") {
      setEmailStep("input");
      setCodeError(null);
    }
  };

  const isLoading = loading || submitting;
  const displayError = localError || error;

  const inputClass =
    "w-full h-12 px-4 rounded-xl bg-surface-lowest text-on-surface text-base outline-none placeholder:text-muted-accessible/50 focus:ring-2 focus:ring-deer/30";

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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

        {/* 手机号注册 */}
        {method === "phone" && (
          <form onSubmit={handleSubmit} className="space-y-4">
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
              autoComplete="off"
              className={inputClass}
            />

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
              placeholder="确认密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              className={inputClass}
            />

            {displayError && <p className="text-sm text-maple text-center">{displayError}</p>}

            <button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
              disabled={isLoading || !phone.trim() || !password.trim() || !confirmPassword.trim() || (phoneTouched && !isValidPhone)}
            >
              {isLoading ? "注册中..." : "注册"}
            </button>
          </form>
        )}

        {/* 邮箱注册 — Step 1: 输入邮箱 */}
        {method === "email" && emailStep === "input" && (
          <div className="space-y-4">
            <input
              type="email"
              placeholder="邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sendingCode}
              autoComplete="email"
              className={inputClass}
            />
            {email && !isValidEmail && (
              <p className="text-xs text-maple">请输入正确的邮箱地址</p>
            )}

            {displayError && <p className="text-sm text-maple text-center">{displayError}</p>}

            <button
              type="button"
              onClick={handleSendCode}
              className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
              disabled={sendingCode || !email.trim() || !isValidEmail}
            >
              {sendingCode ? "发送中..." : "发送验证码"}
            </button>
          </div>
        )}

        {/* 邮箱注册 — Step 2: 输入验证码 */}
        {method === "email" && emailStep === "verify" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-accessible">验证码已发送到</p>
              <p className="text-base text-on-surface font-medium">{maskEmail(email)}</p>
            </div>

            <VerificationCodeInput
              onComplete={handleVerifyCode}
              error={codeError}
              disabled={verifyingCode}
            />

            {codeError && (
              <p className="text-sm text-maple text-center">{codeError}</p>
            )}

            <div className="text-center space-y-2">
              {countdown > 0 && (
                <p className="text-xs text-muted-accessible">
                  验证码 {formatTime(countdown)} 后过期
                </p>
              )}
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCountdown > 0 || sendingCode}
                className="text-xs text-antler hover:underline disabled:text-muted-accessible disabled:no-underline"
              >
                {resendCountdown > 0
                  ? `重新发送 (${resendCountdown}s)`
                  : sendingCode
                    ? "发送中..."
                    : "重新发送验证码"}
              </button>
            </div>
          </div>
        )}

        {/* 邮箱注册 — Step 3: 设置密码 */}
        {method === "email" && emailStep === "password" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="昵称（选填）"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isLoading}
              autoComplete="off"
              className={inputClass}
            />

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
              placeholder="确认密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              className={inputClass}
            />

            {displayError && <p className="text-sm text-maple text-center">{displayError}</p>}

            <button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
              disabled={isLoading || !password.trim() || !confirmPassword.trim()}
            >
              {isLoading ? "注册中..." : "注册"}
            </button>
          </form>
        )}

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
