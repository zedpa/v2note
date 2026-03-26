/**
 * reader-utils 测试 — 阅读器工具函数
 *
 * 覆盖 spec 6 个场景的可测试逻辑：
 * 1. 长内容阈值检测
 * 2. 排版配置
 * 3. 选中文字工具栏动作
 * 4. 问路路上下文构建
 * 5. 每日回顾格式化
 * 6. 素材 vs 日记模式区分
 */

import { describe, it, expect } from "vitest";

import {
  shouldShowReadMore,
  READER_CONFIG,
  getToolbarActions,
  buildAskContext,
  formatReviewContent,
  getReaderMode,
} from "./reader-utils";

// ─── 场景 1: 长内容进入阅读模式 ───

describe("shouldShowReadMore", () => {
  it("should_return_true_when_text_exceeds_500_chars", () => {
    const longText = "测".repeat(501);
    expect(shouldShowReadMore(longText)).toBe(true);
  });

  it("should_return_false_when_text_under_500_chars", () => {
    const shortText = "测".repeat(200);
    expect(shouldShowReadMore(shortText)).toBe(false);
  });

  it("should_return_false_for_exactly_500_chars", () => {
    const exactText = "测".repeat(500);
    expect(shouldShowReadMore(exactText)).toBe(false);
  });

  it("should_return_false_for_empty_text", () => {
    expect(shouldShowReadMore("")).toBe(false);
  });
});

// ─── 场景 2: 阅读器排版 ───

describe("READER_CONFIG", () => {
  it("should_have_max_width_640", () => {
    expect(READER_CONFIG.maxWidth).toBe(640);
  });

  it("should_have_font_size_18", () => {
    expect(READER_CONFIG.fontSize).toBe(18);
  });

  it("should_have_line_height_1_8", () => {
    expect(READER_CONFIG.lineHeight).toBe(1.8);
  });
});

// ─── 场景 3: 选中文字交互 ───

describe("getToolbarActions", () => {
  it("should_include_four_actions", () => {
    const actions = getToolbarActions();
    expect(actions).toHaveLength(4);
  });

  it("should_include_highlight_annotate_ask_link", () => {
    const actions = getToolbarActions();
    const names = actions.map((a) => a.id);
    expect(names).toContain("highlight");
    expect(names).toContain("annotate");
    expect(names).toContain("ask");
    expect(names).toContain("link");
  });

  it("should_have_labels_in_chinese", () => {
    const actions = getToolbarActions();
    const labels = actions.map((a) => a.label);
    expect(labels).toContain("高亮");
    expect(labels).toContain("批注");
    expect(labels).toContain("问路路");
    expect(labels).toContain("建立链接");
  });
});

// ─── 场景 4: 阅读中问路路 ───

describe("buildAskContext", () => {
  it("should_include_full_text_and_highlighted_selection", () => {
    const fullText = "这是一篇关于供应链的长文章。其中关键段落讨论了物流优化。";
    const selection = "物流优化";

    const ctx = buildAskContext(fullText, selection);

    expect(ctx).toContain(fullText);
    expect(ctx).toContain(selection);
    // 选中部分应有标记
    expect(ctx).toContain("【选中】");
  });

  it("should_handle_empty_selection", () => {
    const fullText = "一篇文章内容";
    const ctx = buildAskContext(fullText, "");

    expect(ctx).toContain(fullText);
    expect(ctx).not.toContain("【选中】");
  });
});

// ─── 场景 5: 每日回顾的阅读体验 ───

describe("formatReviewContent", () => {
  it("should_format_review_with_sections", () => {
    const report = {
      insights: ["你最近在供应链上有新的思考"],
      actionItems: ["评估供应商A的交期", "整理物流数据"],
      reflections: ["试着回想一下为什么选了这个方向"],
    };

    const formatted = formatReviewContent(report);

    expect(formatted).toContain("洞察");
    expect(formatted).toContain("供应链");
    expect(formatted).toContain("行动建议");
    expect(formatted).toContain("评估供应商A的交期");
    expect(formatted).toContain("反思引导");
  });

  it("should_omit_empty_sections", () => {
    const report = {
      insights: ["一条洞察"],
      actionItems: [],
      reflections: [],
    };

    const formatted = formatReviewContent(report);

    expect(formatted).toContain("洞察");
    expect(formatted).not.toContain("行动建议");
    expect(formatted).not.toContain("反思引导");
  });
});

// ─── 场景 6: 素材阅读器 ───

describe("getReaderMode", () => {
  it("should_return_diary_for_think_source", () => {
    expect(getReaderMode("think")).toBe("diary");
  });

  it("should_return_diary_for_voice_source", () => {
    expect(getReaderMode("voice")).toBe("diary");
  });

  it("should_return_material_for_material_source", () => {
    expect(getReaderMode("material")).toBe("material");
  });

  it("should_return_diary_for_unknown_source", () => {
    expect(getReaderMode("other")).toBe("diary");
  });
});
