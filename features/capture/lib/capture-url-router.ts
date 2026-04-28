/**
 * Capture URL Router — 解析 v2note://capture/* URL 并路由到对应捕获模式。
 *
 * 支持的路径：
 *   - v2note://capture/voice        → 极简录音模式
 *   - v2note://capture/voice?source=xxx → 同上，source 写入 CaptureSource
 *   - v2note://capture/text         → 极简文字输入
 *   - v2note://capture/text?content=X → 预填文字的极简输入
 *
 * 未知 capture 路径 → 重定向到主页
 */

import type { CaptureSource } from "@/shared/lib/capture-store";

/** 有效的捕获来源（URL ?source= 参数） */
const VALID_CAPTURE_SOURCES: ReadonlySet<string> = new Set([
  "notification_capture",
  "floating_bubble",
  "ios_shortcut",
]);

/** 默认 source（无参数时） */
export const DEFAULT_CAPTURE_SOURCE: CaptureSource = "notification_capture";

export type CaptureRouteMode = "voice" | "text";

export interface CaptureRouteResult {
  /** 路由是否有效 */
  valid: boolean;
  /** 捕获模式 */
  mode: CaptureRouteMode | null;
  /** 来源上下文 */
  source: CaptureSource;
  /** 预填文字内容（仅 text 模式） */
  prefillContent: string | null;
}

/**
 * 解析 capture URL，提取模式、来源和预填内容。
 *
 * @param url - 完整 URL 或路径部分（如 "/capture/voice?source=notification_capture"）
 * @returns 路由解析结果
 */
export function parseCaptureUrl(url: string): CaptureRouteResult {
  try {
    // 兼容完整 URL（v2note://capture/voice）和纯路径（/capture/voice）
    let parsedUrl: URL;
    if (url.startsWith("v2note://")) {
      // v2note://capture/voice → 用 https 替换以便 URL 正常解析
      parsedUrl = new URL(url.replace("v2note://", "https://v2note.app/"));
    } else if (url.startsWith("/")) {
      parsedUrl = new URL(url, "https://v2note.app");
    } else {
      parsedUrl = new URL(url);
    }

    const pathname = parsedUrl.pathname;

    // 提取 capture 后的子路径
    const captureMatch = pathname.match(/^\/capture\/(.+?)(?:\/.*)?$/);
    if (!captureMatch) {
      return { valid: false, mode: null, source: DEFAULT_CAPTURE_SOURCE, prefillContent: null };
    }

    const modeStr = captureMatch[1];

    // 校验模式
    if (modeStr !== "voice" && modeStr !== "text") {
      return { valid: false, mode: null, source: DEFAULT_CAPTURE_SOURCE, prefillContent: null };
    }

    // 解析 source 参数
    const sourceParam = parsedUrl.searchParams.get("source");
    const source: CaptureSource =
      sourceParam && VALID_CAPTURE_SOURCES.has(sourceParam)
        ? (sourceParam as CaptureSource)
        : DEFAULT_CAPTURE_SOURCE;

    // 解析 content 参数（仅 text 模式有意义）
    const content = modeStr === "text" ? parsedUrl.searchParams.get("content") : null;

    return {
      valid: true,
      mode: modeStr,
      source,
      prefillContent: content,
    };
  } catch {
    return { valid: false, mode: null, source: DEFAULT_CAPTURE_SOURCE, prefillContent: null };
  }
}

/**
 * 判断 CaptureSource 是否属于快速捕获来源。
 * 用于 capture-push 映射 gateway sourceContext。
 */
export function isQuickCaptureSource(source: CaptureSource): boolean {
  return (
    source === "notification_capture" ||
    source === "floating_bubble" ||
    source === "ios_shortcut"
  );
}

/**
 * 将 CaptureSource 映射到 gateway sourceContext。
 * 快速捕获来源统一映射为 "timeline"。
 */
export function toGatewaySourceContext(
  source: CaptureSource,
): "timeline" | "todo" | "chat" | "review" {
  if (isQuickCaptureSource(source)) return "timeline";
  // 其他来源按原有逻辑（fab → timeline, chat_view → chat 等）
  switch (source) {
    case "fab":
    case "fab_command":
      return "timeline";
    case "chat_view":
    case "chat_voice":
      return "chat";
    default:
      return "timeline";
  }
}
