"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, ChevronRight, Camera, LogOut } from "lucide-react";
import { getMe, updateProfile, sendEmailCode, verifyEmailCode, bindEmail as bindEmailApi } from "@/shared/lib/api/auth";
import { VerificationCodeInput } from "./verification-code-input";
import type { AppUser } from "@/shared/lib/types";

interface UserSettingsProps {
  onClose: () => void;
  onLogout: () => void;
  onUserUpdated?: (user: AppUser) => void;
}

type View = "main" | "edit-name" | "bind-email";
type BindStep = "input" | "verify" | "done";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskPhone(phone: string | null): string {
  if (!phone || phone.length < 7) return phone ?? "";
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.length > 1 ? local[0] + "***" : local;
  return `${masked}@${domain}`;
}

export function UserSettings({ onClose, onLogout, onUserUpdated }: UserSettingsProps) {
  const [view, setView] = useState<View>("main");
  const [user, setUser] = useState<{
    id: string;
    phone: string | null;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    createdAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // 编辑昵称
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // 绑定邮箱
  const [bindStep, setBindStep] = useState<BindStep>("input");
  const [bindEmail, setBindEmailValue] = useState("");
  const [bindError, setBindError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    getMe().then((data) => {
      setUser(data.user);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const handleSaveName = useCallback(async () => {
    const name = editName.trim();
    if (!name || name.length > 20) return;
    setSavingName(true);
    try {
      const result = await updateProfile({ displayName: name });
      setUser((prev) => prev ? { ...prev, displayName: result.user.displayName } : prev);
      if (onUserUpdated && user) {
        onUserUpdated({ ...user, displayName: result.user.displayName } as AppUser);
      }
      setView("main");
    } catch {
      // 静默
    } finally {
      setSavingName(false);
    }
  }, [editName, user, onUserUpdated]);

  const handleSendBindCode = useCallback(async () => {
    if (!bindEmail.trim() || !EMAIL_REGEX.test(bindEmail.trim())) {
      setBindError("请输入正确的邮箱地址");
      return;
    }
    setBindError(null);
    setSendingCode(true);
    try {
      await sendEmailCode(bindEmail.trim(), "bind");
      setBindStep("verify");
      setResendCountdown(60);
    } catch (err: any) {
      setBindError(err.message ?? "发送失败");
    } finally {
      setSendingCode(false);
    }
  }, [bindEmail]);

  const handleVerifyBindCode = useCallback(async (code: string) => {
    setCodeError(null);
    setVerifyingCode(true);
    try {
      const result = await verifyEmailCode(bindEmail.trim(), code, "bind");
      // 验证成功，绑定邮箱
      const bindResult = await bindEmailApi(bindEmail.trim(), result.verificationToken);
      setUser((prev) => prev ? { ...prev, email: bindResult.user.email } : prev);
      if (onUserUpdated && user) {
        onUserUpdated({ ...user, email: bindResult.user.email } as AppUser);
      }
      setBindStep("done");
    } catch (err: any) {
      setCodeError(err.message ?? "验证失败");
    } finally {
      setVerifyingCode(false);
    }
  }, [bindEmail, user, onUserUpdated]);

  const handleResendBindCode = useCallback(async () => {
    setSendingCode(true);
    try {
      await sendEmailCode(bindEmail.trim(), "bind");
      setResendCountdown(60);
    } catch (err: any) {
      setCodeError(err.message ?? "发送失败");
    } finally {
      setSendingCode(false);
    }
  }, [bindEmail]);

  const inputClass =
    "w-full h-12 px-4 rounded-xl bg-surface-lowest text-on-surface text-base outline-none placeholder:text-muted-accessible/50 focus:ring-2 focus:ring-deer/30";

  const initial = user?.displayName?.charAt(0)?.toUpperCase() || "U";

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-surface flex items-center justify-center">
        <p className="text-sm text-muted-accessible">加载中...</p>
      </div>
    );
  }

  // ── 编辑昵称 ──
  if (view === "edit-name") {
    return (
      <div className="fixed inset-0 z-50 bg-surface">
        <div className="max-w-lg mx-auto px-5 pt-safe-top">
          <div className="flex items-center gap-3 h-14">
            <button onClick={() => setView("main")} className="text-muted-accessible">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="text-base font-medium text-on-surface">修改昵称</h2>
          </div>
          <div className="mt-6 space-y-4">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="输入新昵称"
              maxLength={20}
              className={inputClass}
              autoFocus
            />
            <p className="text-xs text-muted-accessible text-right">{editName.length}/20</p>
            <button
              onClick={handleSaveName}
              disabled={savingName || !editName.trim() || editName.trim().length > 20}
              className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            >
              {savingName ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 绑定/更换邮箱 ──
  if (view === "bind-email") {
    return (
      <div className="fixed inset-0 z-50 bg-surface">
        <div className="max-w-lg mx-auto px-5 pt-safe-top">
          <div className="flex items-center gap-3 h-14">
            <button onClick={() => { setView("main"); setBindStep("input"); setBindError(null); setCodeError(null); }} className="text-muted-accessible">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="text-base font-medium text-on-surface">
              {user?.email ? "更换邮箱" : "绑定邮箱"}
            </h2>
          </div>

          <div className="mt-6">
            {bindStep === "input" && (
              <div className="space-y-4">
                <input
                  type="email"
                  value={bindEmail}
                  onChange={(e) => setBindEmailValue(e.target.value)}
                  placeholder="输入邮箱地址"
                  className={inputClass}
                  autoFocus
                />
                {bindError && <p className="text-sm text-maple text-center">{bindError}</p>}
                <button
                  onClick={handleSendBindCode}
                  disabled={sendingCode || !bindEmail.trim()}
                  className="w-full h-12 rounded-xl text-base font-medium text-white transition-opacity disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
                >
                  {sendingCode ? "发送中..." : "发送验证码"}
                </button>
              </div>
            )}

            {bindStep === "verify" && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-accessible">验证码已发送到</p>
                  <p className="text-base text-on-surface font-medium">{maskEmail(bindEmail)}</p>
                </div>
                <VerificationCodeInput
                  onComplete={handleVerifyBindCode}
                  error={codeError}
                  disabled={verifyingCode}
                />
                {codeError && <p className="text-sm text-maple text-center">{codeError}</p>}
                <div className="text-center">
                  <button
                    onClick={handleResendBindCode}
                    disabled={resendCountdown > 0 || sendingCode}
                    className="text-xs text-antler hover:underline disabled:text-muted-accessible"
                  >
                    {resendCountdown > 0 ? `重新发送 (${resendCountdown}s)` : "重新发送验证码"}
                  </button>
                </div>
              </div>
            )}

            {bindStep === "done" && (
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
                  <span className="text-3xl">&#10003;</span>
                </div>
                <p className="text-base text-on-surface">邮箱绑定成功</p>
                <button
                  onClick={() => { setView("main"); setBindStep("input"); }}
                  className="w-full h-12 rounded-xl text-base font-medium text-white"
                  style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
                >
                  返回
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── 主设置页 ──
  return (
    <div className="fixed inset-0 z-50 bg-surface">
      <div className="max-w-lg mx-auto px-5 pt-safe-top">
        {/* 顶栏 */}
        <div className="flex items-center gap-3 h-14">
          <button onClick={onClose} className="text-muted-accessible">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-medium text-on-surface">用户设置</h2>
        </div>

        {/* 头像 */}
        <div className="flex flex-col items-center py-6">
          <div className="relative">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-medium text-white overflow-hidden"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <button
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-surface-lowest border border-border flex items-center justify-center"
              onClick={() => { /* TODO: 头像上�� */ }}
            >
              <Camera className="h-3.5 w-3.5 text-muted-accessible" />
            </button>
          </div>
        </div>

        {/* 信息列表 */}
        <div className="divide-y divide-border rounded-xl bg-surface-lowest overflow-hidden">
          {/* 昵称 */}
          <button
            onClick={() => { setEditName(user?.displayName ?? ""); setView("edit-name"); }}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="text-sm text-muted-accessible">昵称</span>
            <span className="flex items-center gap-1 text-sm text-on-surface">
              {user?.displayName || "未设置"}
              <ChevronRight className="h-4 w-4 text-muted-accessible" />
            </span>
          </button>

          {/* 手机号 */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-muted-accessible">手机号</span>
            <span className="text-sm text-on-surface">
              {user?.phone ? maskPhone(user.phone) : <span className="text-muted-accessible">未绑定</span>}
            </span>
          </div>

          {/* 邮箱 */}
          <button
            onClick={() => { setBindEmailValue(""); setBindStep("input"); setBindError(null); setView("bind-email"); }}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="text-sm text-muted-accessible">邮箱</span>
            <span className="flex items-center gap-1 text-sm text-on-surface">
              {user?.email || <span className="text-muted-accessible">未绑定</span>}
              <ChevronRight className="h-4 w-4 text-muted-accessible" />
            </span>
          </button>

          {/* 注册时间 */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-muted-accessible">注册时间</span>
            <span className="text-sm text-on-surface">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("zh-CN") : "-"}
            </span>
          </div>
        </div>

        {/* 退出登录 */}
        <button
          onClick={onLogout}
          className="mt-8 w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-surface-lowest text-maple text-sm font-medium"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>
    </div>
  );
}

