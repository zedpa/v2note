/**
 * HarmonyOS NEXT JSBridge 类型定义与获取函数
 * 鸿蒙壳通过 WebView 注入 window.__harmony_bridge__ 对象
 */

export interface HarmonyBridge {
  device: {
    getId(): Promise<string>;
    getInfo(): Promise<{ platform: "harmony"; model: string; osVersion: string }>;
  };
  audio: {
    requestPermission(): Promise<boolean>;
    start(options?: { format?: "aac" | "wav" }): Promise<void>;
    startStream(): Promise<void>;
    stop(): Promise<{ duration: number; totalBytes: number }>;
    /** 取消录音，不合并数据，直接释放资源 */
    cancel(): Promise<void>;
    /** 分段获取录音 PCM 数据（base64） */
    getData(offset: number, length: number): Promise<string>;
    getStatus(): Promise<"idle" | "recording">;
  };
  preferences: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  statusBar: {
    init(options: { backgroundColor: string; style: "light" | "dark" }): Promise<void>;
  };
  notification: {
    schedule(options: {
      id: number;
      title: string;
      body: string;
      scheduledAt?: string; // ISO 8601
      repeatInterval?: "daily" | "weekly";
    }): Promise<void>;
    cancel(id: number): Promise<void>;
    cancelAll(): Promise<void>;
  };
  safeArea: {
    getInsets(): Promise<{ top: number; bottom: number; left: number; right: number }>;
  };
  system: {
    openUrl(url: string): Promise<void>;
    getVersion(): Promise<string>;
  };
}

/** 获取鸿蒙 JSBridge，不在鸿蒙环境时返回 null */
export function getHarmonyBridge(): HarmonyBridge | null {
  if (typeof window === "undefined") return null;
  return (window as any).__harmony_bridge__ ?? null;
}
