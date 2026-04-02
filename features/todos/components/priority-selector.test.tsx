import { describe, it, expect } from "vitest";
import React from "react";
import { PrioritySelector, PRIORITY_OPTIONS, priorityToLabel } from "./priority-selector";

describe("PrioritySelector", () => {
  it("should_have_4_options_low_medium_high_urgent", () => {
    expect(PRIORITY_OPTIONS).toHaveLength(4);
    expect(PRIORITY_OPTIONS.map((o) => o.value)).toEqual([1, 3, 4, 5]);
    expect(PRIORITY_OPTIONS.map((o) => o.label)).toEqual(["低", "中", "高", "紧急"]);
  });

  it("should_render_all_4_options", () => {
    const html = renderToString(
      <PrioritySelector value={3} onChange={() => {}} />,
    );
    expect(html).toContain("低");
    expect(html).toContain("中");
    expect(html).toContain("高");
    expect(html).toContain("紧急");
  });

  it("should_highlight_selected_option_medium_by_default", () => {
    const html = renderToString(
      <PrioritySelector value={3} onChange={() => {}} />,
    );
    // 选中的"中"应该有蓝色样式
    expect(html).toContain("bg-blue-500");
  });

  it("should_highlight_urgent_when_value_is_5", () => {
    const html = renderToString(
      <PrioritySelector value={5} onChange={() => {}} />,
    );
    expect(html).toContain("bg-red-500");
  });

  it("should_highlight_high_when_value_is_4", () => {
    const html = renderToString(
      <PrioritySelector value={4} onChange={() => {}} />,
    );
    expect(html).toContain("bg-orange-400");
  });
});

describe("priorityToLabel", () => {
  it("should_return_correct_labels", () => {
    expect(priorityToLabel(1)).toBe("低");
    expect(priorityToLabel(3)).toBe("中");
    expect(priorityToLabel(4)).toBe("高");
    expect(priorityToLabel(5)).toBe("紧急");
  });

  it("should_return_中_for_null_or_unknown", () => {
    expect(priorityToLabel(null)).toBe("中");
    expect(priorityToLabel(2)).toBe("中");
  });
});

/** 简易 JSX → HTML 字符串序列化 */
function renderToString(element: React.ReactElement | null): string {
  if (!element) return "";
  if (typeof element === "string" || typeof element === "number") return String(element);

  const { type, props } = element;
  if (typeof type === "function") {
    return renderToString((type as Function)(props));
  }

  let html = "";
  const p = props as Record<string, any>;
  if (p?.className) html += ` class="${p.className}"`;

  const children = p?.children;
  if (children != null) {
    if (Array.isArray(children)) {
      html += children.map((c: any) => {
        if (React.isValidElement(c)) return renderToString(c);
        if (c != null && c !== false) return String(c);
        return "";
      }).join("");
    } else if (React.isValidElement(children)) {
      html += renderToString(children);
    } else if (typeof children === "string" || typeof children === "number") {
      html += String(children);
    }
  }

  return html;
}
