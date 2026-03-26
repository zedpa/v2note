/**
 * 阅读器工具函数 — 纯逻辑，无 UI 依赖。
 */

/** 阅读模式阈值（字符数） */
const READ_MORE_THRESHOLD = 500;

/** 判断是否应显示"阅读全文"按钮 */
export function shouldShowReadMore(text: string): boolean {
  return text.length > READ_MORE_THRESHOLD;
}

/** 阅读器排版配置 */
export const READER_CONFIG = {
  maxWidth: 640,
  fontSize: 18,
  lineHeight: 1.8,
  fontFamily: "'Noto Serif SC', serif",
} as const;

/** 选中文字工具栏动作 */
export interface ToolbarAction {
  id: "highlight" | "annotate" | "ask" | "link";
  label: string;
  icon: string;
}

export function getToolbarActions(): ToolbarAction[] {
  return [
    { id: "highlight", label: "高亮", icon: "highlighter" },
    { id: "annotate", label: "批注", icon: "message-square" },
    { id: "ask", label: "问路路", icon: "bot" },
    { id: "link", label: "建立链接", icon: "link" },
  ];
}

/** 构建"问路路"的上下文（全文 + 选中标记） */
export function buildAskContext(fullText: string, selection: string): string {
  if (!selection) {
    return fullText;
  }
  return `${fullText}\n\n【选中】${selection}`;
}

/** 每日回顾格式化 */
export interface ReviewReport {
  insights: string[];
  actionItems: string[];
  reflections: string[];
}

export function formatReviewContent(report: ReviewReport): string {
  const parts: string[] = [];

  if (report.insights.length > 0) {
    parts.push("## 洞察");
    for (const insight of report.insights) {
      parts.push(`- ${insight}`);
    }
  }

  if (report.actionItems.length > 0) {
    parts.push("\n## 行动建议");
    for (const item of report.actionItems) {
      parts.push(`- [ ] ${item}`);
    }
  }

  if (report.reflections.length > 0) {
    parts.push("\n## 反思引导");
    for (const r of report.reflections) {
      parts.push(`> ${r}`);
    }
  }

  return parts.join("\n");
}

/** 根据 source_type 判断阅读模式 */
export type ReaderMode = "diary" | "material";

export function getReaderMode(sourceType: string): ReaderMode {
  if (sourceType === "material") return "material";
  return "diary";
}
