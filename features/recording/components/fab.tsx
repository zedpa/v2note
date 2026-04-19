"use client";

/**
 * 已知限制（待后续 Phase 处理）：
 * - m6 UI 感知 gap：Phase 6（时间线本地合并）未交付前，用户会看到"已记录" toast
 *   但时间线中暂无该条目（时间线仍只读服务端 records）。等 Phase 6 落地。
 * - m3 游客模式：userId=null 的 captures pushCapture 会被 gateway 401；
 *   这是 Phase 8（游客归属）的工作。
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Mic, X, Command, Lock, Send, Sparkles, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePCMRecorder } from "@/features/recording/hooks/use-pcm-recorder";
import { useFabGestures } from "@/features/recording/hooks/use-fab-gestures";
import {
  getGatewayClient,
  type GatewayResponse,
} from "@/features/chat/lib/gateway-client";
import { emit } from "@/features/recording/lib/events";
import { getSettings } from "@/shared/lib/local-config";
import { TextBottomSheet } from "./text-bottom-sheet";
import { RecordingImmersive } from "./recording-immersive";
import type { CommandContext } from "@/features/commands/lib/registry";
import { fabNotify, onFabNotify, type FabNotification } from "@/shared/lib/fab-notify";
import { startAiPipeline, renewAiPipeline, endAiPipeline } from "@/shared/lib/ai-processing";
import { saveAudio, mergeChunks, checkCacheSize, markCompleted, getAudioByRecordId, type PendingAudio } from "@/features/recording/lib/audio-cache";
import { createRecord } from "@/shared/lib/api/records";
import { AudioSession } from "@/shared/lib/audio-session";
import { saveFabCapture, decideFinishDispatch, shouldAcceptAsrDone } from "@/features/recording/lib/fab-capture";
import { getCurrentUser } from "@/shared/lib/auth";
import type { CaptureSource } from "@/shared/lib/capture-store";
import { captureStore } from "@/shared/lib/capture-store";

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

const WITTY_PROCESSING = [
  "正在向宇宙发送电波…",
  "正在翻译你的脑电波…",
  "让我想想你说了啥…",
  "收到！正在解码中…",
  "正在和云端的小伙伴商量…",
];

interface FABProps {
  onStartReview?: (dateRange: { start: string; end: string }) => void;
  onCommandDetected?: (command: string, args?: string[]) => void;
  onOpenCommandChat?: (initialText: string) => void;
  onOpenSkillChat?: (skillName: string) => void;
  commandContext?: Partial<CommandContext>;
  activeNotebook?: string | null;
  sourceContext?: "todo" | "timeline" | "chat" | "review";
  /** 录音状态变化回调（recording/locked 时为 true） */
  onRecordingChange?: (isRecording: boolean) => void;
  /** 控制 FAB 可见性 — 弹窗打开时隐藏 */
  visible?: boolean;
}

export function FAB({
  onStartReview,
  onCommandDetected,
  onOpenCommandChat,
  onOpenSkillChat,
  commandContext,
  activeNotebook,
  sourceContext = "timeline",
  onRecordingChange,
  visible = true,
}: FABProps) {
  const [showTextSheet, setShowTextSheet] = useState(false);
  const [displayDuration, setDisplayDuration] = useState(0);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(32).fill(8));
  const [confirmedText, setConfirmedText] = useState("");
  const [partialText, setPartialText] = useState("");
  const [lockedPaused, setLockedPaused] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [wittyText, setWittyText] = useState("");
  const [capsuleNotify, setCapsuleNotify] = useState<FabNotification | null>(null);
  const capsuleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pipelineIdRef = useRef<string | null>(null);

  const recorder = usePCMRecorder();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveRef = useRef<NodeJS.Timeout | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const volumeRef = useRef(0);
  const pausedRef = useRef(false);
  const commandReleaseRef = useRef(false);

  const preBufferRef = useRef<ArrayBuffer[]>([]);
  const fullBufferRef = useRef<ArrayBuffer[]>([]); // 累积完整录音（本地缓存用）
  const cacheIdRef = useRef<string | null>(null);   // 当前录音的 IndexedDB 缓存 ID
  const asrDoneTimerRef = useRef<NodeJS.Timeout | null>(null); // asr.done 超时检测
  const streamingRef = useRef(false);
  const preCaptureAbortRef = useRef(false);
  const preCaptureDelayRef = useRef<NodeJS.Timeout | null>(null);
  const activeNotebookRef = useRef(activeNotebook);
  activeNotebookRef.current = activeNotebook;
  const sourceContextRef = useRef(sourceContext);
  sourceContextRef.current = sourceContext;
  const gwClientRef = useRef<ReturnType<typeof getGatewayClient> | null>(null);
  const audioActivatedRef = useRef(false);
  // C3：PCM 门闩。stopRecording() 期间 worklet 尾帧若回调，直接丢弃。
  const recordingClosedRef = useRef(false);
  // M3：当前录音会话 id。用于过滤 asr.done 的跨录音错关联。
  const activeSessionIdRef = useRef<string | null>(null);
  // M4：最近一次 capture 的 localId（供 asr.done 标记同步）。
  const lastCaptureLocalIdRef = useRef<string | null>(null);

  const startTimers = useCallback(() => {
    setDisplayDuration(0);

    timerRef.current = setInterval(() => {
      if (!pausedRef.current) {
        setDisplayDuration((d) => d + 1);
      }
    }, 1000);

    waveRef.current = setInterval(() => {
      const vol = pausedRef.current ? 0 : volumeRef.current;
      setWaveHeights(
        Array(32)
          .fill(0)
          .map(() => {
            const noise = Math.random() * 0.5 + 0.5;
            return Math.max(4, vol * 60 * noise + 6);
          }),
      );
    }, 80);
  }, []);

  const stopTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (waveRef.current) clearInterval(waveRef.current);
    timerRef.current = null;
    waveRef.current = null;
    volumeRef.current = 0;
    setWaveHeights(Array(32).fill(8));
  }, []);

  // ─── 音频会话管理: 录音时打断系统音频，结束后恢复 ───
  const activateAudioSession = useCallback(async () => {
    try {
      await Promise.race([
        AudioSession.activate(),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
      audioActivatedRef.current = true;
    } catch { /* 静默 */ }
  }, []);

  const deactivateAudioSession = useCallback(async () => {
    if (!audioActivatedRef.current) return;
    audioActivatedRef.current = false;
    try { await AudioSession.deactivate(); } catch { /* 静默 */ }
  }, []);

  // 监听全局 fabNotify 事件，显示胶囊通知
  useEffect(() => {
    return onFabNotify((n) => {
      if (capsuleTimerRef.current) clearTimeout(capsuleTimerRef.current);
      setCapsuleNotify(n);
      capsuleTimerRef.current = setTimeout(() => {
        setCapsuleNotify(null);
        capsuleTimerRef.current = null;
      }, n.duration ?? 2000);
    });
  }, []);

  // App 启动时检查 pending 缓存，补创建占位 record
  useEffect(() => {
    import("@/features/recording/lib/audio-cache").then(async ({ getAllPending, updateRecordId, checkCacheSize }) => {
      try {
        const pending = await getAllPending();
        for (const item of pending) {
          if (item.recordId) continue; // 已有占位 record
          try {
            const result = await createRecord({
              status: "pending_retry",
              source: "voice",
              duration_seconds: item.duration,
              notebook: item.notebook ?? undefined,
            });
            if (result?.id) {
              await updateRecordId(item.id, result.id);
            }
          } catch {
            // 网络仍不可用，下次再试
          }
        }
        if (pending.length > 0) {
          emit("recording:uploaded"); // 刷新时间线
        }
        // 缓存大小提醒
        const overSize = await checkCacheSize();
        if (overSize) {
          fabNotify.info("本地录音缓存较多，可在日记菜单中清理");
        }
      } catch { /* IndexedDB 不可用 */ }
    });
  }, []);

  useEffect(() => {
    const client = getGatewayClient();
    if (!client.connected) client.connect();

    const unsub = client.onMessage((msg: GatewayResponse) => {
      switch (msg.type) {
        case "asr.partial":
          setPartialText(msg.payload.text);
          break;
        case "asr.sentence":
          setConfirmedText((prev) => prev + msg.payload.text);
          setPartialText("");
          break;
        case "asr.done": {
          // M3：跨录音错关联防护（逻辑抽到 shouldAcceptAsrDone 便于单测）
          const payloadSessionId = (msg.payload as { sessionId?: string }).sessionId;
          if (!shouldAcceptAsrDone(payloadSessionId, activeSessionIdRef.current)) {
            break;
          }

          if (asrDoneTimerRef.current) { clearTimeout(asrDoneTimerRef.current); asrDoneTimerRef.current = null; }

          // legacy: 关联 recordId 到旧 audio-cache（仍在用的 pending_retry 记录依赖这个）
          if (msg.payload.recordId && cacheIdRef.current) {
            import("@/features/recording/lib/audio-cache").then(({ updateRecordId }) => {
              if (cacheIdRef.current) updateRecordId(cacheIdRef.current, msg.payload.recordId);
            }).catch(() => {});
          }

          // C1：asr.done 带 recordId 且本地有匹配 localId 的 capture → 标记 synced
          //   避免后续 pushCapture 重复推送（gateway 已幂等，但这里先标同步节约一次 HTTP）
          if (msg.payload.recordId && lastCaptureLocalIdRef.current) {
            const localId = lastCaptureLocalIdRef.current;
            captureStore
              .update(localId, { serverId: msg.payload.recordId, syncStatus: "synced" })
              .catch(() => { /* 不阻塞 UI */ });
            lastCaptureLocalIdRef.current = null;
          }

          // C1：forceCommand 分发恢复——asr.done 是指令执行结果的权威来源
          if (commandReleaseRef.current) {
            commandReleaseRef.current = false;
            resetRef.current();
            window.dispatchEvent(new CustomEvent("v2note:forceCommand", {
              detail: { transcript: (msg.payload.transcript || "").trim() },
            }));
            return;
          }
          // 新链路：UI 已由 saveFabCapture 处理，不再在此 emit "已记录" 或启动 pipeline
          break;
        }
        case "asr.error":
          // 清除超时检测
          if (asrDoneTimerRef.current) { clearTimeout(asrDoneTimerRef.current); asrDoneTimerRef.current = null; }
          fabNotify.error(`识别错误: ${msg.payload.message}`);
          stopTimers();
          setDisplayDuration(0);
          setConfirmedText("");
          setPartialText("");
          pausedRef.current = false;
          setLockedPaused(false);
          commandReleaseRef.current = false;
          setProcessing(false);
          setWittyText("");
          resetRef.current();
          if (pipelineIdRef.current) { endAiPipeline(pipelineIdRef.current); pipelineIdRef.current = null; }
          // 触发失败处理（保留本地缓存供重试）
          handleRecordingFailure(msg.payload.message);
          break;
        case "process.result":
          emit("recording:processed");
          // 标记本地缓存为已完成（不自动删除，由用户决定）
          if (cacheIdRef.current) {
            markCompleted(cacheIdRef.current).catch(() => {});
            cacheIdRef.current = null;
          }
          // 全局管道：续期（digest + todo 投影还在跑）
          if (pipelineIdRef.current) renewAiPipeline(pipelineIdRef.current);
          break;
        case "todo.created":
          emit("recording:processed");
          // 全局管道：终态
          if (pipelineIdRef.current) { endAiPipeline(pipelineIdRef.current); pipelineIdRef.current = null; }
          break;
        case "tool.done": {
          // 数据变更类工具执行完后，刷新前端列表
          const dataTools = new Set([
            "manage_wiki_page", "create_record", "update_record",
            "delete_record", "create_todo", "update_todo", "delete_todo",
            "create_goal", "update_goal", "update_user_info",
          ]);
          if (dataTools.has(msg.payload.toolName)) {
            emit("recording:processed");
          }
          break;
        }
        case "error":
          if (pipelineIdRef.current) fabNotify.error("整理失败");
          setProcessing(false);
          setWittyText("");
          if (pipelineIdRef.current) { endAiPipeline(pipelineIdRef.current); pipelineIdRef.current = null; }
          break;
        case "command.detected":
          onCommandDetected?.(msg.payload.command, msg.payload.args);
          break;
      }
    });

    return () => unsub();
  }, [onCommandDetected, onOpenCommandChat, stopTimers]);

  const asrModeRef = useRef<"realtime" | "upload">("realtime");

  const startPreCapture = useCallback(async () => {
    preBufferRef.current = [];
    fullBufferRef.current = [];
    cacheIdRef.current = crypto.randomUUID();
    streamingRef.current = false;
    preCaptureAbortRef.current = false;
    gwClientRef.current = null;
    // C3：新一次录音开始 → 重新开门
    recordingClosedRef.current = false;

    try {
      // pre-capture 阶段即请求音频焦点，打断系统音频（fix-recording-audio-focus）
      await activateAudioSession();

      await recorder.startRecording({
        onPCMData: (chunk) => {
          // C3：录音已关闭 → 丢弃尾帧（可能是 stopRecording() 期间 worklet 的回调）
          if (recordingClosedRef.current) return;
          if (pausedRef.current) return;

          // 始终累积到 fullBuffer（本地缓存用）
          fullBufferRef.current.push(chunk.slice(0));

          if (!streamingRef.current) {
            preBufferRef.current.push(chunk.slice(0));
          } else {
            gwClientRef.current?.sendBinary(chunk);
            const view = new Int16Array(chunk);
            let sum = 0;
            for (let i = 0; i < view.length; i++) {
              const v = view[i] / 32768;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / view.length);
            volumeRef.current = Math.min(1, rms * 5);
          }
        },
        onError: (err) => {
          fabNotify.error(`录音错误: ${err.message}`);
          deactivateAudioSession();
          resetRef.current();
        },
      });

      if (preCaptureAbortRef.current) {
        recorder.cancelRecording();
        preBufferRef.current = [];
      }
    } catch {
      // Mic permission denied — 释放已获取的音频焦点（fix-recording-audio-focus）
      deactivateAudioSession();
    }
  }, [recorder]);

  const stopPreCapture = useCallback(() => {
    if (preCaptureDelayRef.current) {
      clearTimeout(preCaptureDelayRef.current);
      preCaptureDelayRef.current = null;
    }
    preCaptureAbortRef.current = true;
    if (recorder.isActive.current) {
      recorder.cancelRecording();
    }
    preBufferRef.current = [];
    streamingRef.current = false;
    gwClientRef.current = null;
    // 短按取消时释放音频焦点（fix-recording-audio-focus）
    deactivateAudioSession();
  }, [recorder]);

  const startRecording = useCallback(async () => {
    try {
      // 激活音频会话，打断系统音频（500ms 超时）
      await activateAudioSession();

      pausedRef.current = false;
      setLockedPaused(false);
      commandReleaseRef.current = false;
      // C3：新一次录音 → 开门（覆盖 pre-capture 未触发的场景）
      recordingClosedRef.current = false;

      // M3：生成新的 sessionId 用于后续 asr.done 过滤
      //     复用 cacheIdRef 当前 uuid（若 pre-capture 已生成）；否则新建一个
      if (!cacheIdRef.current) cacheIdRef.current = crypto.randomUUID();
      activeSessionIdRef.current = cacheIdRef.current;

      const settings = await getSettings();
      const asrMode = settings.asrMode ?? "realtime";
      asrModeRef.current = asrMode;

      // fix-cold-resume-silent-loss §2.2: 不再 await waitForReady，录音立即启动
      // WS 连接只用于实时 partial text 预览（非必需）。即使 WS 未就绪，录音数据通过
      // fullBufferRef 本地累积，释放时由 saveFabCapture 直接落地到 captureStore。
      const client = getGatewayClient();
      if (!client.connected) {
        // 异步触发连接，不 await；失败也不报错（只是没有 partial text）
        try { client.connect(); } catch { /* best effort */ }
      }
      gwClientRef.current = client;

      // 若 WS 已 OPEN，发 asr.start 走实时预览；否则跳过（录音仍继续）
      try {
        if (client.connected) {
          client.send({
            type: "asr.start",
            // M3：附带 sessionId（gateway 若不回显也无害，但若回显则用于防错关联）
            payload: {
              mode: asrMode,
              notebook: activeNotebookRef.current ?? undefined,
              sourceContext: sourceContextRef.current,
              sessionId: activeSessionIdRef.current ?? undefined,
            } as never,
          });
          for (const chunk of preBufferRef.current) {
            client.sendBinary(chunk);
          }
          streamingRef.current = true;
        }
      } catch {
        // WS 相关错误全部吞掉，不阻塞录音
      }
      preBufferRef.current = [];

      if (!recorder.isActive.current) {
        await recorder.startRecording({
          onPCMData: (chunk) => {
            // C3：录音已关闭 → 丢弃尾帧
            if (recordingClosedRef.current) return;
            if (pausedRef.current) return;
            fullBufferRef.current.push(chunk.slice(0));
            // fix-cold-resume-silent-loss §2.2: 仅在 streamingRef 真正建立时才发送
            // WS 未连接时录音继续在本地累积，松手后由 saveFabCapture 直接落地
            if (streamingRef.current && client.connected) {
              try { client.sendBinary(chunk); } catch { /* WS 掉线，忽略 */ }
            }
            const view = new Int16Array(chunk);
            let sum = 0;
            for (let i = 0; i < view.length; i++) {
              const v = view[i] / 32768;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / view.length);
            volumeRef.current = Math.min(1, rms * 5);
          },
          onError: (err) => {
            fabNotify.error(`录音错误: ${err.message}`);
            deactivateAudioSession();
            resetRef.current();
          },
        });
      }

      setConfirmedText("");
      setPartialText("");
      startTimers();
    } catch (err: any) {
      // Phase 7 §5.3：捕获路径不再把网络错误作为阻塞提示。
      // 网络相关错误（fetch/network）→ 静默，交由 SyncStatusBanner 汇总；
      // 只有真实的"无法启动录音"（麦克风权限 / 设备错误）才向用户提示。
      const msg = err.message ?? "";
      const isNetworkErr = msg.includes("fetch") || msg.includes("network");
      if (!isNetworkErr) {
        fabNotify.error(`无法开始录音: ${msg}`);
      }
      stopTimers();
      stopPreCapture();
      deactivateAudioSession();
      resetRef.current();
    }
  }, [recorder, startTimers, stopTimers, stopPreCapture, activateAudioSession, deactivateAudioSession]);

  // 录音失败时的处理：保存本地缓存 + 创建占位 record
  const handleRecordingFailure = useCallback(async (reason: string) => {
    // 恢复系统音频
    deactivateAudioSession();

    const chunks = fullBufferRef.current;
    const id = cacheIdRef.current;
    if (!id || chunks.length === 0) return;

    // 录音 < 1 秒不缓存
    const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const durationSec = totalBytes / (16000 * 2); // 16kHz 16-bit mono
    if (durationSec < 1) return;

    try {
      const pcmData = mergeChunks(chunks);
      const entry: PendingAudio = {
        id,
        pcmData,
        duration: Math.round(durationSec),
        sourceContext: sourceContextRef.current as PendingAudio["sourceContext"],
        forceCommand: false,
        notebook: activeNotebookRef.current ?? null,
        createdAt: new Date().toISOString(),
        status: "pending",
        lastError: reason,
      };
      await saveAudio(entry);

      // 尝试创建占位 record
      try {
        const result = await createRecord({
          status: "pending_retry",
          source: "voice",
          duration_seconds: Math.round(durationSec),
          notebook: activeNotebookRef.current ?? undefined,
        });
        if (result?.id) {
          const { updateRecordId } = await import("@/features/recording/lib/audio-cache");
          await updateRecordId(id, result.id);
        }
      } catch {
        // 网络完全断开，占位 record 也创建不了，下次启动时补
      }

      emit("recording:uploaded");
      fabNotify.info("录音已保存，网络恢复后可重试");

      // 检查缓存大小
      const overSize = await checkCacheSize();
      if (overSize) {
        fabNotify.info("本地录音缓存较多，可在日记菜单中清理");
      }
    } catch (err) {
      console.error("[fab] Failed to save audio cache:", err);
    }
  }, [deactivateAudioSession]);

  const finishRecording = useCallback(
    async (asCommand: boolean) => {
      stopTimers();
      pausedRef.current = false;
      setLockedPaused(false);
      preBufferRef.current = [];

      // C3：先关闭门闩，再 await stopRecording——之后 worklet 的任何尾帧都会被丢弃
      recordingClosedRef.current = true;

      // 先停止录音（PCM 采集结束，fullBufferRef 已累积完整数据）
      try {
        await recorder.stopRecording();
      } catch (err: any) {
        console.error("[fab] stopRecording error:", err);
      }

      streamingRef.current = false;
      gwClientRef.current = null;
      deactivateAudioSession();

      // M4：不提前清空 fullBufferRef——若 saveFabCapture 抛错，handleRecordingFailure 仍能
      // 拿到 chunks 兜底到旧 audio-cache。成功/失败后在结尾统一清空。
      const chunks = fullBufferRef.current;
      const sessionIdAtFinish = activeSessionIdRef.current;

      // C1：指令录音 → 同步通知 gateway 执行三层指令路由（决策抽到 decideFinishDispatch）
      const client = getGatewayClient();
      const wsConnected = client.connected;
      const dispatch = decideFinishDispatch({
        asCommand,
        wsConnected,
        sessionId: sessionIdAtFinish,
      });
      if (dispatch.type === "send_asr_stop_force_command") {
        try {
          // commandReleaseRef 打开，asr.done 监听器会把 transcript dispatch 到 forceCommand
          commandReleaseRef.current = true;
          client.send({ type: "asr.stop", payload: dispatch.payload as never });
        } catch {
          // WS 失败不阻塞主流程，后续仍落地本地 capture
        }
      }

      // fix-cold-resume-silent-loss §2.1 / §2.3：录音结束立即本地落地
      // 不等 WS / token / ASR；saveFabCapture 内部触发 sync 调度器（有网时秒级同步）
      let savedOk = false;
      try {
        const user = getCurrentUser();
        const sourceCtx: CaptureSource = asCommand ? "fab_command" : "fab";
        const result = await saveFabCapture({
          chunks,
          asCommand,
          notebook: activeNotebookRef.current ?? null,
          userId: user?.id ?? null,
          sourceContext: sourceCtx,
        });
        savedOk = result.saved !== null;
        if (savedOk) {
          // 记录 localId 供 asr.done 标记 synced（C1 去重）
          lastCaptureLocalIdRef.current = result.saved?.localId ?? null;
          // UI 文案：指令模式区分 WS 已连 / 未连两种语义
          if (asCommand) {
            if (wsConnected) {
              fabNotify.info("指令已记录，处理中...");
            } else {
              fabNotify.info("指令已记录，联网后执行");
            }
          } else {
            fabNotify.success("已记录");
          }
          // 通知时间线刷新（Phase 6 才真正合并本地，当前至少触发一次 refresh）
          emit("recording:uploaded");
          // 重置 UI
          setDisplayDuration(0);
          setConfirmedText("");
          setPartialText("");
        }
        // 保存完成（成功或短录音丢弃）→ 清空 fullBuffer
        fullBufferRef.current = [];
        cacheIdRef.current = null;
        activeSessionIdRef.current = null;
      } catch (err: any) {
        console.error("[fab] saveFabCapture failed:", err);
        // M4：提示用户本地存储问题，给兜底（含当前 chunks）
        fabNotify.error("本地存储空间不足，录音保存失败，请清理存储后重试");
        // 兜底到旧 audio-cache（handleRecordingFailure 自行读取 fullBufferRef）
        handleRecordingFailure(err?.message ?? "save failed");
        // 最终清空（handleRecordingFailure 已读取过 chunks）
        fullBufferRef.current = [];
        cacheIdRef.current = null;
        activeSessionIdRef.current = null;
        return;
      }

      // 有 WS 连接时 cancel 正在进行的 asr 流（普通录音；指令模式走 asr.stop 不再 cancel）
      if (dispatch.type === "send_asr_cancel") {
        try {
          client.send({ type: "asr.cancel", payload: {} });
        } catch {
          // 忽略
        }
      }

      if (!savedOk) {
        // 录音太短（<1s）→ 静默不提示
      }
    },
    [recorder, stopTimers, handleRecordingFailure, deactivateAudioSession],
  );

  const cancelRecording = useCallback(async () => {
    stopTimers();
    pausedRef.current = false;
    setLockedPaused(false);
    commandReleaseRef.current = false;
    streamingRef.current = false;
    // C3：取消录音 → 关闭门闩，丢弃后续尾帧
    recordingClosedRef.current = true;
    // M3：清空当前 sessionId
    activeSessionIdRef.current = null;
    preBufferRef.current = [];
    fullBufferRef.current = [];
    cacheIdRef.current = null;
    gwClientRef.current = null;

    recorder.cancelRecording();
    // 恢复系统音频
    deactivateAudioSession();

    try {
      const client = getGatewayClient();
      client.send({ type: "asr.cancel", payload: {} });
    } catch {
      // ignore
    }

    setDisplayDuration(0);
    setConfirmedText("");
    setPartialText("");
  }, [stopTimers, recorder, deactivateAudioSession]);

  const fabRef = useRef<HTMLButtonElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const gestures = useFabGestures({
    onTap: () => {
      // 短按：取消延迟启动的 pre-capture，避免 AudioWorkletNode 创建报错
      if (preCaptureDelayRef.current) {
        clearTimeout(preCaptureDelayRef.current);
        preCaptureDelayRef.current = null;
      }
      stopPreCapture();
    },
    onLongPressStart: () => {
      longPressTriggeredRef.current = true;
      if (fabRef.current && pointerIdRef.current !== null) {
        try { fabRef.current.setPointerCapture(pointerIdRef.current); } catch {}
      }
      startRecording();
    },
    onSwipeLeft: () => cancelRecording(),
    onSwipeRight: () => {
      // phase transitions to "locked" by gesture hook
    },
    onSwipeUp: () => finishRecording(true), // v2: 上滑 = 指令模式，发送 forceCommand=true
    onRelease: () => finishRecording(false),
  });

  const { phase, swipeDirection, swipeProgress, deltaX, deltaY, reset, handlers } = gestures;
  resetRef.current = reset;

  const toggleLockedPause = useCallback(() => {
    setLockedPaused((prev) => {
      const next = !prev;
      pausedRef.current = next;
      if (next) {
        volumeRef.current = 0;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (phase === "idle" && !streamingRef.current && recorder.isActive.current) {
      stopPreCapture();
    }
  }, [phase, recorder.isActive, stopPreCapture]);

  // 向父组件报告录音状态
  useEffect(() => {
    onRecordingChange?.(phase === "recording" || phase === "locked");
  }, [phase, onRecordingChange]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveRef.current) clearInterval(waveRef.current);
      deactivateAudioSession();
    };
  }, []);

  // ─── Swipe-aware visual state ───
  const activeDirection = swipeDirection;
  const progress = swipeProgress;

  // FAB follows finger with elastic damping
  const fabOffsetX = phase === "recording" ? deltaX * 0.35 : 0;
  const fabOffsetY = phase === "recording" ? Math.min(0, -deltaY * 0.35) : 0;

  if (phase === "locked") {
    return (
      <RecordingImmersive
        duration={displayDuration}
        paused={lockedPaused}
        onTogglePause={toggleLockedPause}
        onCancel={() => {
          cancelRecording();
          reset();
        }}
        onDone={() => {
          finishRecording(false);
          reset();
        }}
      />
    );
  }

  // 弹窗打开时隐藏 FAB（仅在 idle 状态隐藏，避免录音中途消失）
  if (!visible && phase === "idle") return null;

  return (
    <>
      {/* ─── RECORDING: Full-screen immersive backdrop ─── */}
      {phase === "recording" && (
        <div
          className="fixed inset-0 z-30 pointer-events-none select-none"
          style={{ top: "calc(44px + env(safe-area-inset-top, 0px))" }}
        >
          {/* Dark theater backdrop */}
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              background: "radial-gradient(ellipse 120% 100% at 50% 100%, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.95) 100%)",
            }}
          />

          {/* Colored glow based on swipe direction */}
          <div
            className="absolute inset-0 transition-all duration-200"
            style={{
              background:
                activeDirection === "left"
                  ? `radial-gradient(circle at ${30 - progress * 15}% 75%, rgba(239,68,68,${0.15 + progress * 0.2}) 0%, transparent 55%)`
                  : activeDirection === "up"
                    ? `radial-gradient(circle at 50% ${45 - progress * 20}%, rgba(245,158,11,${0.15 + progress * 0.2}) 0%, transparent 55%)`
                    : activeDirection === "right"
                      ? `radial-gradient(circle at ${70 + progress * 15}% 75%, rgba(16,185,129,${0.15 + progress * 0.2}) 0%, transparent 55%)`
                      : "radial-gradient(circle at 50% 85%, rgba(249,115,22,0.12) 0%, transparent 50%)",
            }}
          />

          {/* ─── TOP: Timer + status ─── */}
          <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-8">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <span className="text-[13px] tracking-[0.2em] text-white/50 uppercase font-medium">录音中</span>
            </div>
            <p className="text-5xl font-mono font-extralight text-white/90 tabular-nums tracking-[0.15em]">
              {formatDuration(displayDuration)}
            </p>
          </div>

          {/* ─── CENTER: Large waveform ─── */}
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 flex items-center justify-center">
            <div className="flex items-center justify-center gap-[4px] h-28 w-full max-w-sm">
              {waveHeights.map((h, i) => {
                const centerDist = Math.abs(i - 15.5) / 15.5;
                const falloff = 1 - centerDist * 0.4;
                const finalH = Math.max(4, h * falloff * 1.8);
                return (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-[80ms]"
                    style={{
                      width: "4px",
                      height: `${finalH}px`,
                      backgroundColor:
                        activeDirection === "left"
                          ? `rgba(239,68,68,${0.4 + (finalH / 100) * 0.6})`
                          : activeDirection === "up"
                            ? `rgba(245,158,11,${0.4 + (finalH / 100) * 0.6})`
                            : activeDirection === "right"
                              ? `rgba(16,185,129,${0.4 + (finalH / 100) * 0.6})`
                              : `rgba(249,115,22,${0.35 + (finalH / 100) * 0.65})`,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* ─── Real-time transcript ─── */}
          {(confirmedText || partialText) && (
            <div className="absolute left-8 right-8 top-[58%] flex justify-center">
              <p className="text-center text-base leading-relaxed max-w-xs">
                <span className="text-white/80">{confirmedText}</span>
                <span className="text-white/35">{partialText}</span>
              </p>
            </div>
          )}

          {/* ─── SWIPE ZONES: Large directional labels ─── */}
          {/* LEFT — Cancel */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center transition-all duration-200"
            style={{
              opacity: activeDirection === "left" ? 0.7 + progress * 0.3 : activeDirection === "none" ? 0.65 : 0.15,
              transform: `translateY(-50%) translateX(${activeDirection === "left" ? 8 + progress * 12 : 8}px) scale(${activeDirection === "left" ? 1 + progress * 0.3 : 1})`,
            }}
          >
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm transition-all duration-200",
              activeDirection === "left"
                ? "bg-red-500/20 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                : "bg-white/10 border border-white/15",
            )}>
              <X className={cn(
                "transition-all duration-200",
                activeDirection === "left" ? "w-5 h-5 text-red-400" : "w-4 h-4 text-white/60",
              )} />
              <span className={cn(
                "font-medium transition-all duration-200",
                activeDirection === "left"
                  ? "text-sm text-red-400"
                  : "text-xs text-white/70",
              )}>
                取消
              </span>
            </div>
          </div>

          {/* RIGHT — Lock */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center transition-all duration-200"
            style={{
              opacity: activeDirection === "right" ? 0.7 + progress * 0.3 : activeDirection === "none" ? 0.65 : 0.15,
              transform: `translateY(-50%) translateX(${activeDirection === "right" ? -8 - progress * 12 : -8}px) scale(${activeDirection === "right" ? 1 + progress * 0.3 : 1})`,
            }}
          >
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm transition-all duration-200",
              activeDirection === "right"
                ? "bg-emerald-500/20 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                : "bg-white/10 border border-white/15",
            )}>
              <Lock className={cn(
                "transition-all duration-200",
                activeDirection === "right" ? "w-5 h-5 text-emerald-400" : "w-4 h-4 text-white/60",
              )} />
              <span className={cn(
                "font-medium transition-all duration-200",
                activeDirection === "right"
                  ? "text-sm text-emerald-400"
                  : "text-xs text-white/70",
              )}>
                常驻
              </span>
            </div>
          </div>

          {/* UP — Command */}
          <div
            className="absolute top-[28%] left-1/2 -translate-x-1/2 flex items-center transition-all duration-200"
            style={{
              opacity: activeDirection === "up" ? 0.7 + progress * 0.3 : activeDirection === "none" ? 0.65 : 0.15,
              transform: `translateX(-50%) translateY(${activeDirection === "up" ? -progress * 16 : 0}px) scale(${activeDirection === "up" ? 1 + progress * 0.3 : 1})`,
            }}
          >
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm transition-all duration-200",
              activeDirection === "up"
                ? "bg-amber-500/20 border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                : "bg-white/10 border border-white/15",
            )}>
              <Command className={cn(
                "transition-all duration-200",
                activeDirection === "up" ? "w-5 h-5 text-amber-400" : "w-4 h-4 text-white/60",
              )} />
              <span className={cn(
                "font-medium transition-all duration-200",
                activeDirection === "up"
                  ? "text-sm text-amber-400"
                  : "text-xs text-white/70",
              )}>
                指令
              </span>
            </div>
          </div>

          {/* BOTTOM CENTER — Release to send hint */}
          <div
            className="absolute bottom-[160px] left-1/2 -translate-x-1/2 transition-all duration-200"
            style={{
              opacity: activeDirection === "none" ? 0.8 : 0.2,
              transform: `translateX(-50%) scale(${activeDirection === "none" ? 1 : 0.85})`,
            }}
          >
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10">
              <Send className="w-4 h-4 text-white/50" />
              <span className="text-sm text-white/70 font-medium">松开发送</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── FAB Button ─── */}
      <div
        data-testid="fab-button"
        data-guide="fab"
        className="fixed left-1/2 z-40"
        style={{
          bottom: showTextSheet ? "54px" : "calc(54px + var(--kb-offset, 0px))",
          transform: `translateX(-50%) translateX(${fabOffsetX}px) translateY(${fabOffsetY}px)`,
          transition: phase === "recording" ? "none" : "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), bottom 150ms ease-out",
        }}
      >
        {/* Processing capsule / Notify capsule */}
        {processing && phase === "idle" ? (
          <div
            className="flex items-center gap-2 h-12 px-4 rounded-full text-white animate-bubble-enter"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)", boxShadow: "0 8px 24px rgba(28, 28, 24, 0.06)" }}
          >
            <Sparkles className="w-5 h-5 animate-spin-slow shrink-0" />
            <span className="text-sm font-medium whitespace-nowrap">{wittyText}</span>
          </div>
        ) : capsuleNotify && phase === "idle" ? (
          <div
            className="flex items-center gap-1.5 h-10 px-3.5 rounded-full text-white animate-bubble-enter"
            style={{
              background: capsuleNotify.level === "error"
                ? "linear-gradient(135deg, #9B2C2C, #C53030)"
                : capsuleNotify.level === "success"
                  ? "linear-gradient(135deg, #276749, #38A169)"
                  : "linear-gradient(135deg, #89502C, #C8845C)",
              boxShadow: "0 8px 24px rgba(28, 28, 24, 0.06)",
            }}
          >
            {capsuleNotify.level === "error" ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : capsuleNotify.level === "success" ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : null}
            <span className="text-sm font-medium whitespace-nowrap">{capsuleNotify.text}</span>
          </div>
        ) : (
          <>
            {/* Pressing ripples */}
            {phase === "pressing" && (
              <>
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-fab-ripple" />
                <div
                  className="absolute inset-0 rounded-full bg-primary/15 animate-fab-ripple"
                  style={{ animationDelay: "0.4s" }}
                />
              </>
            )}

            {/* Recording ring — larger, more dramatic */}
            {phase === "recording" && (
              <>
                <div className="absolute -inset-3 rounded-full border-2 border-primary/40 animate-pulse pointer-events-none" />
                <div className="absolute -inset-6 rounded-full border border-primary/15 animate-pulse pointer-events-none" style={{ animationDelay: "0.5s" }} />
              </>
            )}

            <button
              ref={fabRef}
              type="button"
              {...handlers}
              onPointerDown={(e) => {
                longPressTriggeredRef.current = false;
                pointerIdRef.current = e.pointerId;
                // 延迟启动 pre-capture，短按(tap)时会在 onTap 中清除，避免无谓的 AudioContext 创建
                if (preCaptureDelayRef.current) clearTimeout(preCaptureDelayRef.current);
                preCaptureDelayRef.current = setTimeout(() => {
                  preCaptureDelayRef.current = null;
                  startPreCapture();
                }, 120);
                handlers.onPointerDown(e);
              }}
              onClick={() => {
                if (!longPressTriggeredRef.current) {
                  setShowTextSheet(true);
                }
              }}
              className={cn(
                "relative flex items-center justify-center rounded-full select-none touch-none transition-all duration-300",
                "text-white backdrop-blur-xl",
                phase === "idle" && "w-16 h-16",
                phase === "pressing" && "w-[70px] h-[70px] scale-105",
                phase === "recording" && "w-16 h-16",
              )}
              style={{
                background: phase === "recording"
                  ? "rgba(196,92,92,0.75)"
                  : "rgba(137,80,44,0.55)",
                boxShadow: "0 8px 24px rgba(28, 28, 24, 0.08), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              {phase === "idle" ? (
                <Mic className="w-8 h-8" />
              ) : (
                <Mic className={cn(
                  "transition-all duration-200",
                  phase === "recording" ? "w-8 h-8 animate-pulse" : "w-9 h-9",
                )} />
              )}
            </button>
          </>
        )}
      </div>

      <TextBottomSheet
        open={showTextSheet}
        onClose={() => setShowTextSheet(false)}
        onStartReview={onStartReview}
        onCommandMode={(text) => {
          setShowTextSheet(false);
          onOpenCommandChat?.(text);
        }}
        onSkillSelect={(skillName) => {
          setShowTextSheet(false);
          onOpenSkillChat?.(skillName);
        }}
        commandContext={commandContext}
        activeNotebook={activeNotebook}
        sourceContext={sourceContext}
        onRecordPress={() => {
          longPressTriggeredRef.current = true;
          gestures.forcePhase("locked");
          startRecording();
        }}
      />
    </>
  );
}
