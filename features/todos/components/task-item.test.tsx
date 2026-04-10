import { describe, it, expect, vi } from "vitest";
import React from "react";
import { TaskItem } from "./task-item";
import type { TodoDTO } from "../lib/todo-types";

/** 创建最小 TodoDTO 测试数据 */
function makeTodo(overrides: Partial<TodoDTO> = {}): TodoDTO {
  return {
    id: "test-1",
    text: "测试待办",
    done: false,
    record_id: null,
    created_at: "2026-04-02T10:00:00Z",
    scheduled_start: null,
    scheduled_end: null,
    estimated_minutes: null,
    priority: null,
    domain: null,
    impact: null,
    ai_actionable: false,
    ai_action_plan: null,
    level: 0,
    parent_id: null,
    cluster_id: null,
    status: "active",
    strike_id: null,
    goal_id: null,
    subtask_count: 0,
    subtask_done_count: 0,
    goal_title: null,
    reminder_at: null,
    reminder_before: null,
    ...overrides,
  };
}

const noop = () => {};

describe("TaskItem", () => {
  // ── 优先级色点 ─────────────────────────────────────────────────

  describe("优先级左边框", () => {
    it("should_not_render_priority_border_when_priority_is_null", () => {
      const result = TaskItem({ todo: makeTodo({ priority: null }), onToggle: noop });
      const html = renderToString(result);
      expect(html).not.toContain("border-l-red-500");
      expect(html).not.toContain("border-l-orange-400");
    });

    it("should_not_render_priority_border_when_priority_is_3_default", () => {
      const result = TaskItem({ todo: makeTodo({ priority: 3 }), onToggle: noop });
      const html = renderToString(result);
      expect(html).not.toContain("border-l-red-500");
      expect(html).not.toContain("border-l-orange-400");
    });

    it("should_not_render_priority_border_when_priority_is_1_low", () => {
      const result = TaskItem({ todo: makeTodo({ priority: 1 }), onToggle: noop });
      const html = renderToString(result);
      expect(html).not.toContain("border-l-red-500");
      expect(html).not.toContain("border-l-orange-400");
    });

    it("should_render_orange_left_border_when_priority_is_4", () => {
      const result = TaskItem({ todo: makeTodo({ priority: 4 }), onToggle: noop });
      const html = renderToString(result);
      expect(html).toContain("border-l-orange-400");
      expect(html).not.toContain("border-l-red-500");
    });

    it("should_render_red_left_border_when_priority_is_5_high", () => {
      const result = TaskItem({ todo: makeTodo({ priority: 5 }), onToggle: noop });
      const html = renderToString(result);
      expect(html).toContain("border-l-red-500");
    });
  });

  // ── 目标标签 ───────────────────────────────────────────────────

  describe("目标标签", () => {
    it("should_not_render_goal_label_when_goal_title_is_null", () => {
      const result = TaskItem({ todo: makeTodo({ goal_title: null }), onToggle: noop });
      const html = renderToString(result);
      expect(html).not.toContain("bg-muted");
    });

    it("should_render_goal_label_when_goal_title_exists", () => {
      const result = TaskItem({
        todo: makeTodo({ goal_title: "供应链优化" }),
        onToggle: noop,
      });
      const html = renderToString(result);
      expect(html).toContain("供应链优化");
      expect(html).toContain("bg-muted");
    });

    it("should_render_goal_label_with_truncate_class", () => {
      const result = TaskItem({
        todo: makeTodo({ goal_title: "这是一个非常长的目标标题需要截断显示" }),
        onToggle: noop,
      });
      const html = renderToString(result);
      expect(html).toContain("truncate");
      expect(html).toContain("max-w-[120px]");
    });
  });

  // ── Meta 行显示逻辑 ───────────────────────────────────────────

  describe("Meta 行", () => {
    it("should_not_render_meta_row_when_no_date_no_duration_no_goal", () => {
      const result = TaskItem({
        todo: makeTodo({
          scheduled_start: null,
          estimated_minutes: null,
          goal_title: null,
        }),
        onToggle: noop,
      });
      const html = renderToString(result);
      // Meta 行的 gap-2 class 不应出现
      expect(html).not.toContain("gap-2");
    });

    it("should_render_meta_row_with_only_goal_title", () => {
      const result = TaskItem({
        todo: makeTodo({
          scheduled_start: null,
          estimated_minutes: null,
          goal_title: "健身计划",
        }),
        onToggle: noop,
      });
      const html = renderToString(result);
      expect(html).toContain("健身计划");
    });

    it("should_render_all_meta_items_together", () => {
      const result = TaskItem({
        todo: makeTodo({
          scheduled_start: "2026-04-02T15:00:00",
          estimated_minutes: 30,
          goal_title: "项目交付",
        }),
        onToggle: noop,
      });
      const html = renderToString(result);
      expect(html).toContain("30分");
      expect(html).toContain("项目交付");
    });
  });

  // ── 组合场景 ──────────────────────────────────────────────────

  describe("组合场景", () => {
    it("should_show_red_border_and_goal_label_together", () => {
      const result = TaskItem({
        todo: makeTodo({
          priority: 5,
          goal_title: "紧急交付",
        }),
        onToggle: noop,
      });
      const html = renderToString(result);
      expect(html).toContain("border-l-red-500");
      expect(html).toContain("紧急交付");
    });

    it("should_keep_border_and_label_when_done", () => {
      const result = TaskItem({
        todo: makeTodo({
          done: true,
          priority: 5,
          goal_title: "已完成目标",
        }),
        onToggle: noop,
      });
      const html = renderToString(result);
      expect(html).toContain("border-l-red-500");
      expect(html).toContain("已完成目标");
      expect(html).toContain("line-through");
    });
  });
});

/**
 * 简易 JSX → HTML 字符串序列化（用于断言 class/内容，不依赖 DOM）
 */
function renderToString(element: React.ReactElement | null): string {
  if (!element) return "";

  if (typeof element === "string" || typeof element === "number") {
    return String(element);
  }

  const { type, props } = element;

  if (typeof type === "function") {
    // 函数组件：调用并递归
    return renderToString((type as Function)(props));
  }

  let html = "";
  const p = props as Record<string, any>;

  // 属性
  if (p?.className) html += ` class="${p.className}"`;
  if (p?.["data-testid"]) html += ` data-testid="${p["data-testid"]}"`;

  // 子元素
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
