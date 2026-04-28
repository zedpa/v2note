"use client";

/**
 * 极简语音捕获页 — /capture/voice
 *
 * Spec #131 Phase A: 全屏深色背景 + 居中波形 + 录音自动开始
 * 不加载主页面的日记/待办/侧边栏等重组件（冷启动 < 1.5s）
 */

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { usePCMRecorder } from "@/features/recording/hooks/use-pcm-recorder";
import {
  saveVoiceCapture,
  MAX_RECORDING_DURATION_SEC,
  SILENCE_TIMEOUT_SEC,
  SUCCESS_ANIMATION_MS,
} from "@/features/capture/lib/quick-capture";
import { parseCaptureUrl } from "@/features/capture/lib/capture-url-router";
import { generateGuestBatchId } from "@/features/capture/lib/quick-capture";

function VoiceCapturePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isRecording, duration, startRecording, stopRecording } = usePCMRecorder();

  const [state, setState] = useState<
    "init" | "recording" | "saving" | "success" | "cancelled" | "max_reached" | "error"
  >("init");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const chunksRef = useRef<ArrayBuffer[]>([]);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAudioTimeRef = useRef(Date.now());
  const guestBatchIdRef = useRef<string | null>(null);

  // 解析 URL 参数
  const sourceParam = searchParams.get("source");
  const routeInfo = parseCaptureUrl(
    `/capture/voice${sourceParam ? `?source=${sourceParam}` : ""}`,
  );

  // 获取当前用户（延迟加载避免重量级依赖）
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

  // 自动开始录音
  useEffect(() => {
    if (state !== "init") return;

    const timer = setTimeout(() => {
      chunksRef.current = [];
      startRecording({
        onPCMData: (chunk: ArrayBuffer) => {
          chunksRef.current.push(chunk);
          lastAudioTimeRef.current = Date.now();
        },
        onError: (err: Error) => {
          console.error("[voice-capture] recording error:", err);
          // 麦克风权限拒绝或其他录音错误
          const msg = err.message?.toLowerCase() ?? "";
          if (msg.includes("permission") || msg.includes("notallowed") || msg.includes("not allowed")) {
            setErrorMsg("麦克风权限被拒绝，请在系统设置中允许使用麦克风");
          } else {
            setErrorMsg(`录音启动失败: ${err.message}`);
          }
          setState("error");
        },
      });
      setState("recording");
    }, 100); // 微延迟确保 mount 完成

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 录音时长上限计时器
  useEffect(() => {
    if (state !== "recording") return;

    maxTimerRef.current = setTimeout(() => {
      setState("max_reached");
    }, MAX_RECORDING_DURATION_SEC * 1000);

    return () => {
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    };
  }, [state]);

  // 5 分钟到达时：先显示提示 1.5s，再自动提交
  useEffect(() => {
    if (state !== "max_reached") return;
    const t = setTimeout(() => handleFinish(), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // 完成录音并保存
  const handleFinish = useCallback(async () => {
    if (state !== "recording" && state !== "max_reached") return;
    setState("saving");

    try {
      await stopRecording();
    } catch {
      // stopRecording 可能在某些情况下失败
    }

    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);

    try {
      await saveVoiceCapture({
        chunks: chunksRef.current,
        sourceContext: routeInfo.source,
        userId: userIdRef.current,
        guestBatchId: guestBatchIdRef.current,
      });
    } catch (e) {
      console.error("[voice-capture] save error:", e);
    }

    setState("success");
    setTimeout(() => {
      // 尝试返回上一个 App
      try {
        window.history.back();
      } catch {
        router.push("/");
      }
    }, SUCCESS_ANIMATION_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, routeInfo.source]);

  // 取消录音
  const handleCancel = useCallback(() => {
    if (state === "recording") {
      setShowConfirm(true);
    } else {
      router.push("/");
    }
  }, [state, router]);

  const confirmCancel = useCallback(async () => {
    setShowConfirm(false);
    try {
      await stopRecording();
    } catch {
      // ignore
    }
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    chunksRef.current = [];
    setState("cancelled");
    try {
      window.history.back();
    } catch {
      router.push("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const dismissConfirm = useCallback(() => {
    setShowConfirm(false);
  }, []);

  // 波形条高度（mount 时计算一次，避免 render 中 Math.random 导致跳变）
  const waveBarHeights = useMemo(
    () => Array.from({ length: 5 }, () => 20 + Math.random() * 24),
    [],
  );

  // 格式化录音时长
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      data-testid="quick-capture-page"
      data-page="capture"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900"
    >
      {/* 录音状态 */}
      {state === "recording" && (
        <>
          <div
            data-testid="recording-indicator"
            className="mb-8 flex flex-col items-center"
          >
            <div
              data-testid="waveform"
              className="mb-4 h-16 w-48 rounded-lg bg-gray-800 flex items-center justify-center"
            >
              {/* 波形动画占位 */}
              <div className="flex gap-1">
                {waveBarHeights.map((h, i) => (
                  <div
                    key={i}
                    className="w-1 bg-red-500 rounded-full animate-pulse"
                    style={{
                      height: `${h}px`,
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                ))}
              </div>
            </div>
            <span className="text-white text-2xl font-mono">
              {formatDuration(duration)}
            </span>
          </div>

          <div className="flex gap-6">
            <button
              data-testid="capture-cancel"
              onClick={handleCancel}
              className="rounded-full bg-gray-700 px-6 py-3 text-white"
            >
              取消
            </button>
            <button
              data-testid="capture-done"
              onClick={handleFinish}
              className="rounded-full bg-red-600 px-8 py-3 text-white font-bold"
            >
              完成
            </button>
          </div>
        </>
      )}

      {/* 最大时长提示 */}
      {state === "max_reached" && (
        <div className="text-white text-center">
          <p className="text-lg">已达最大时长，自动保存</p>
        </div>
      )}

      {/* 保存中 */}
      {state === "saving" && (
        <div className="text-white text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-600 border-t-white mx-auto" />
          <p>保存中...</p>
        </div>
      )}

      {/* 成功动画 */}
      {state === "success" && (
        <div
          data-testid="capture-success"
          className="text-center"
        >
          <div className="mb-4 text-6xl text-green-400">✓</div>
          <p className="text-white text-lg">已保存</p>
        </div>
      )}

      {/* 初始化中 */}
      {state === "init" && (
        <div className="text-white text-center">
          <p>准备录音...</p>
        </div>
      )}

      {/* 错误状态（麦克风权限拒绝等） */}
      {state === "error" && (
        <div className="text-center px-8">
          <div className="mb-4 text-5xl">🎙️</div>
          <p className="mb-6 text-white text-lg">{errorMsg}</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push("/")}
              className="rounded-full bg-gray-700 px-6 py-3 text-white"
            >
              返回
            </button>
            <button
              onClick={() => {
                setState("init");
                setErrorMsg(null);
              }}
              className="rounded-full bg-red-600 px-6 py-3 text-white"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* 取消确认对话框 */}
      {showConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="mx-8 rounded-2xl bg-gray-800 p-6 text-center">
            <p className="mb-6 text-lg text-white">放弃这条录音？</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={dismissConfirm}
                className="rounded-lg bg-gray-600 px-6 py-2 text-white"
              >
                继续录音
              </button>
              <button
                onClick={confirmCancel}
                className="rounded-lg bg-red-600 px-6 py-2 text-white"
              >
                放弃
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VoiceCapturePageWrapper() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-gray-900" />}>
      <VoiceCapturePage />
    </Suspense>
  );
}
