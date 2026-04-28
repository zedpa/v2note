"use client";

/**
 * 极简文字捕获页 — /capture/text
 *
 * Spec #131 Phase A: 输入框自动聚焦 + 发送按钮 + 完成动画
 * 不加载主页面的日记/待办/侧边栏等重组件（冷启动 < 1.5s）
 */

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  saveTextCapture,
  SUCCESS_ANIMATION_MS,
} from "@/features/capture/lib/quick-capture";
import { parseCaptureUrl } from "@/features/capture/lib/capture-url-router";
import { generateGuestBatchId } from "@/features/capture/lib/quick-capture";

function TextCapturePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [text, setText] = useState("");
  const [state, setState] = useState<"input" | "saving" | "success">("input");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const guestBatchIdRef = useRef<string | null>(null);

  // 解析 URL 参数
  const sourceParam = searchParams.get("source");
  const contentParam = searchParams.get("content");
  const routeInfo = parseCaptureUrl(
    `/capture/text${sourceParam ? `?source=${sourceParam}` : ""}${contentParam ? `${sourceParam ? "&" : "?"}content=${encodeURIComponent(contentParam)}` : ""}`,
  );

  // 预填内容
  useEffect(() => {
    if (routeInfo.prefillContent) {
      setText(routeInfo.prefillContent);
    }
  }, [routeInfo.prefillContent]);

  // 自动聚焦
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 获取当前用户
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentUser } = require("@/shared/lib/auth") as {
        getCurrentUser?: () => { id: string } | null;
      };
      userIdRef.current = getCurrentUser?.()?.id ?? null;
    } catch {
      userIdRef.current = null;
    }
    if (!userIdRef.current && !guestBatchIdRef.current) {
      guestBatchIdRef.current = generateGuestBatchId();
    }
  }, []);

  // 发送
  const handleSend = useCallback(async () => {
    if (!text.trim() || state !== "input") return;

    setState("saving");

    try {
      await saveTextCapture({
        text,
        sourceContext: routeInfo.source,
        userId: userIdRef.current,
        guestBatchId: guestBatchIdRef.current,
      });
    } catch (e) {
      console.error("[text-capture] save error:", e);
    }

    setState("success");
    setTimeout(() => {
      try {
        window.history.back();
      } catch {
        router.push("/");
      }
    }, SUCCESS_ANIMATION_MS);
  }, [text, state, routeInfo.source, router]);

  // 取消
  const handleCancel = useCallback(() => {
    try {
      window.history.back();
    } catch {
      router.push("/");
    }
  }, [router]);

  // 回车发送（Shift+Enter 换行）
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div
      data-testid="quick-capture-page"
      data-page="capture"
      className="fixed inset-0 z-50 flex flex-col bg-gray-900"
    >
      {state === "input" && (
        <>
          {/* 顶部操作栏 */}
          <div className="flex items-center justify-between px-4 pt-safe-top py-3">
            <button
              data-testid="capture-cancel"
              onClick={handleCancel}
              className="text-gray-400 text-sm"
            >
              取消
            </button>
            <button
              data-testid="capture-send"
              onClick={handleSend}
              disabled={!text.trim()}
              className={`rounded-full px-6 py-1.5 text-sm font-bold ${
                text.trim()
                  ? "bg-amber-600 text-white"
                  : "bg-gray-700 text-gray-500"
              }`}
            >
              发送
            </button>
          </div>

          {/* 输入区域 */}
          <div
            data-testid="capture-input"
            className="flex-1 px-4 pt-4"
          >
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="写下你的想法..."
              className="w-full h-full bg-transparent text-white text-lg resize-none outline-none placeholder:text-gray-500"
              autoFocus
            />
          </div>
        </>
      )}

      {/* 保存中 */}
      {state === "saving" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-600 border-t-white mx-auto" />
            <p>保存中...</p>
          </div>
        </div>
      )}

      {/* 成功动画 */}
      {state === "success" && (
        <div className="flex-1 flex items-center justify-center">
          <div
            data-testid="capture-success"
            className="text-center"
          >
            <div className="mb-4 text-6xl text-green-400">✓</div>
            <p className="text-white text-lg">已保存</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TextCapturePageWrapper() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-gray-900" />}>
      <TextCapturePage />
    </Suspense>
  );
}
