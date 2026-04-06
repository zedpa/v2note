"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { usePCMRecorder } from "./use-pcm-recorder";
import { getGatewayClient, type GatewayResponse } from "@/features/chat/lib/gateway-client";
import { getDeviceId } from "@/shared/lib/device";

export interface UseVoiceToTextOptions {
  onTranscript: (text: string) => void;
  onError?: (msg: string) => void;
  sourceContext?: "chat" | "review";
}

export interface UseVoiceToTextReturn {
  recording: boolean;
  confirmedText: string;
  partialText: string;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

export function useVoiceToText({
  onTranscript,
  onError,
  sourceContext = "chat",
}: UseVoiceToTextOptions): UseVoiceToTextReturn {
  const [recording, setRecording] = useState(false);
  const [confirmedText, setConfirmedText] = useState("");
  const [partialText, setPartialText] = useState("");
  const recorder = usePCMRecorder();
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const recordingRef = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      unsubRef.current?.();
    };
  }, []);

  const start = useCallback(async () => {
    if (recorder.isActive.current || recordingRef.current) return;

    try {
      const deviceId = await getDeviceId();
      const client = getGatewayClient();

      if (!client.connected) {
        client.connect();
        const ready = await client.waitForReady();
        if (!ready) {
          onErrorRef.current?.("无法连接服务器，请检查网络");
          return;
        }
      }

      // 监听 ASR 消息
      unsubRef.current?.();
      unsubRef.current = client.onMessage((msg: GatewayResponse) => {
        if (!recordingRef.current && msg.type !== "asr.done") return;

        switch (msg.type) {
          case "asr.partial":
            setPartialText(msg.payload.text);
            break;
          case "asr.sentence":
            setConfirmedText((prev) => prev + msg.payload.text);
            setPartialText("");
            break;
          case "asr.done": {
            const transcript = (msg.payload.transcript || "").trim();
            if (transcript) {
              onTranscriptRef.current(transcript);
            }
            setRecording(false);
            recordingRef.current = false;
            setConfirmedText("");
            setPartialText("");
            unsubRef.current?.();
            unsubRef.current = null;
            break;
          }
          case "asr.error":
            onErrorRef.current?.(msg.payload.message || "语音识别失败");
            setRecording(false);
            recordingRef.current = false;
            setConfirmedText("");
            setPartialText("");
            unsubRef.current?.();
            unsubRef.current = null;
            break;
        }
      });

      // 发送 asr.start（saveAudio: false → transcript-only 模式）
      client.send({
        type: "asr.start",
        payload: {
          deviceId,
          mode: "realtime",
          sourceContext,
          saveAudio: false,
        },
      });

      // 启动 PCM 录音
      await recorder.startRecording({
        onPCMData: (chunk) => {
          client.sendBinary(chunk);
        },
        onError: (err) => {
          onErrorRef.current?.(`录音错误: ${err.message}`);
          setRecording(false);
          recordingRef.current = false;
        },
      });

      setRecording(true);
      recordingRef.current = true;
      setConfirmedText("");
      setPartialText("");
    } catch (err: any) {
      onErrorRef.current?.(`无法开始录音: ${err.message}`);
    }
  }, [recorder, sourceContext]);

  const stop = useCallback(() => {
    if (!recordingRef.current) return;

    recorder.stopRecording();

    getDeviceId().then((deviceId) => {
      const client = getGatewayClient();
      client.send({
        type: "asr.stop",
        payload: { deviceId, saveAudio: false, forceCommand: true },
      });
    }).catch(() => {});
    // recording 状态会在 asr.done 回调中置 false
  }, [recorder]);

  const cancel = useCallback(() => {
    if (!recordingRef.current) return;

    recorder.cancelRecording();
    setRecording(false);
    recordingRef.current = false;
    setConfirmedText("");
    setPartialText("");

    getDeviceId().then((deviceId) => {
      const client = getGatewayClient();
      client.send({ type: "asr.cancel", payload: { deviceId } });
    }).catch(() => {});

    unsubRef.current?.();
    unsubRef.current = null;
  }, [recorder]);

  return {
    recording,
    confirmedText,
    partialText,
    start,
    stop,
    cancel,
  };
}
