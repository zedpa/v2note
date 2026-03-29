import { api } from "../api";

export type DeerState =
  | "eating"       // 吃草（默认）
  | "organizing"   // 整理笔记
  | "sunbathing"   // 晒太阳
  | "drinking"     // 喝饮料
  | "spacing_out"  // 发呆
  | "angry"        // 生气
  | "worried"      // 心疼
  | "speaking"     // 说话
  | "thinking"     // 思考
  | "running";     // 跑来跑去

export type Mood = "happy" | "curious" | "worried" | "missing" | "caring" | "focused" | "calm";

export interface PendingMessage {
  type: string;
  text: string;
  autoHide: boolean;
  autoHideMs: number;
  actions?: Array<{ label: string; action: string }>;
  accentColor?: string;
}

export interface CompanionStatus {
  deerState: DeerState;
  statusText: string;
  mood: Mood;
  moodText: string;
  pendingMessage: PendingMessage | null;
}

export async function fetchCompanionStatus(): Promise<CompanionStatus> {
  return api.get("/api/v1/companion/status");
}
