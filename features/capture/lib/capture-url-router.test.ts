/**
 * capture-url-router 单元测试
 *
 * Spec #131 Phase A: URL Scheme 路由解析
 */

import { describe, it, expect } from "vitest";
import {
  parseCaptureUrl,
  isQuickCaptureSource,
  toGatewaySourceContext,
  DEFAULT_CAPTURE_SOURCE,
} from "./capture-url-router";

describe("parseCaptureUrl", () => {
  // 场景 8.1: 极简捕获页路由 — voice 模式
  it("should_parse_voice_mode_when_url_is_capture_voice", () => {
    const result = parseCaptureUrl("v2note://capture/voice");
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("voice");
    expect(result.source).toBe("notification_capture"); // 默认 source
    expect(result.prefillContent).toBeNull();
  });

  // 场景 A2.2: source 参数写入 CaptureSource
  it("should_use_source_param_when_provided_in_voice_url", () => {
    const result = parseCaptureUrl(
      "v2note://capture/voice?source=notification_capture",
    );
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("voice");
    expect(result.source).toBe("notification_capture");
  });

  it("should_accept_ios_shortcut_source_when_provided", () => {
    const result = parseCaptureUrl(
      "v2note://capture/voice?source=ios_shortcut",
    );
    expect(result.valid).toBe(true);
    expect(result.source).toBe("ios_shortcut");
  });

  it("should_accept_floating_bubble_source_when_provided", () => {
    const result = parseCaptureUrl(
      "v2note://capture/voice?source=floating_bubble",
    );
    expect(result.valid).toBe(true);
    expect(result.source).toBe("floating_bubble");
  });

  // 场景 8.1: 极简捕获页路由 — text 模式
  it("should_parse_text_mode_when_url_is_capture_text", () => {
    const result = parseCaptureUrl("v2note://capture/text");
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("text");
    expect(result.prefillContent).toBeNull();
  });

  // 场景 C6.3: 带预填文字
  it("should_extract_prefill_content_when_text_url_has_content_param", () => {
    const result = parseCaptureUrl(
      "v2note://capture/text?content=%E4%B9%B0%E7%89%9B%E5%A5%B6",
    );
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("text");
    expect(result.prefillContent).toBe("买牛奶");
  });

  it("should_ignore_content_param_when_mode_is_voice", () => {
    const result = parseCaptureUrl(
      "v2note://capture/voice?content=hello",
    );
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("voice");
    expect(result.prefillContent).toBeNull();
  });

  // 验收行为 5: 未知 capture 路径
  it("should_mark_invalid_when_capture_path_is_unknown", () => {
    const result = parseCaptureUrl("v2note://capture/unknown");
    expect(result.valid).toBe(false);
    expect(result.mode).toBeNull();
  });

  it("should_mark_invalid_when_url_has_no_capture_path", () => {
    const result = parseCaptureUrl("v2note://action/record");
    expect(result.valid).toBe(false);
    expect(result.mode).toBeNull();
  });

  // 边界条件：无效 source 参数回退默认
  it("should_fallback_to_default_source_when_source_param_is_invalid", () => {
    const result = parseCaptureUrl(
      "v2note://capture/voice?source=invalid_source",
    );
    expect(result.valid).toBe(true);
    expect(result.source).toBe(DEFAULT_CAPTURE_SOURCE);
  });

  // 边界条件：纯路径格式（Next.js 路由使用）
  it("should_parse_bare_path_format", () => {
    const result = parseCaptureUrl("/capture/voice?source=ios_shortcut");
    expect(result.valid).toBe(true);
    expect(result.mode).toBe("voice");
    expect(result.source).toBe("ios_shortcut");
  });

  // 边界条件：空/无效 URL
  it("should_mark_invalid_when_url_is_empty", () => {
    const result = parseCaptureUrl("");
    expect(result.valid).toBe(false);
  });

  it("should_mark_invalid_when_url_is_malformed", () => {
    const result = parseCaptureUrl("not a url at all %%");
    expect(result.valid).toBe(false);
  });

  // 边界条件：无 source 参数
  it("should_default_to_notification_capture_when_no_source_param", () => {
    const result = parseCaptureUrl("v2note://capture/voice");
    expect(result.source).toBe("notification_capture");
  });
});

describe("isQuickCaptureSource", () => {
  it("should_return_true_for_notification_capture", () => {
    expect(isQuickCaptureSource("notification_capture")).toBe(true);
  });

  it("should_return_true_for_floating_bubble", () => {
    expect(isQuickCaptureSource("floating_bubble")).toBe(true);
  });

  it("should_return_true_for_ios_shortcut", () => {
    expect(isQuickCaptureSource("ios_shortcut")).toBe(true);
  });

  it("should_return_false_for_fab", () => {
    expect(isQuickCaptureSource("fab")).toBe(false);
  });

  it("should_return_false_for_chat_view", () => {
    expect(isQuickCaptureSource("chat_view")).toBe(false);
  });
});

describe("toGatewaySourceContext", () => {
  // CaptureSource → Gateway SourceContext 映射：快速捕获 → timeline
  it("should_map_notification_capture_to_timeline", () => {
    expect(toGatewaySourceContext("notification_capture")).toBe("timeline");
  });

  it("should_map_floating_bubble_to_timeline", () => {
    expect(toGatewaySourceContext("floating_bubble")).toBe("timeline");
  });

  it("should_map_ios_shortcut_to_timeline", () => {
    expect(toGatewaySourceContext("ios_shortcut")).toBe("timeline");
  });

  // 保持原有映射
  it("should_map_fab_to_timeline", () => {
    expect(toGatewaySourceContext("fab")).toBe("timeline");
  });

  it("should_map_chat_view_to_chat", () => {
    expect(toGatewaySourceContext("chat_view")).toBe("chat");
  });

  it("should_map_chat_voice_to_chat", () => {
    expect(toGatewaySourceContext("chat_voice")).toBe("chat");
  });
});
