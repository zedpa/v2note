/**
 * suggestion-list.tsx 单元测试
 * Phase 15.3 — 建议列表渲染 + 接受/拒绝
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SuggestionList } from "./suggestion-list";
import type { Suggestion } from "../hooks/use-suggestions";

const baseSuggestions: Suggestion[] = [
  {
    id: "s1",
    suggestion_type: "split",
    payload: { reason: "主题过大，建议拆分" },
    status: "pending",
    created_at: "2026-04-12T00:00:00Z",
  },
  {
    id: "s2",
    suggestion_type: "merge",
    payload: { reason: "两个主题高度重叠" },
    status: "pending",
    created_at: "2026-04-12T01:00:00Z",
  },
];

const baseProps = {
  suggestions: baseSuggestions,
  onAccept: vi.fn(),
  onReject: vi.fn(),
  onClose: vi.fn(),
};

describe("SuggestionList — Phase 15.3", () => {
  it("should_render_suggestion_list_with_descriptions", () => {
    render(<SuggestionList {...baseProps} />);

    expect(screen.getByText("主题过大，建议拆分")).toBeTruthy();
    expect(screen.getByText("两个主题高度重叠")).toBeTruthy();
  });

  it("should_call_onAccept_with_id_when_accept_button_clicked", () => {
    const onAccept = vi.fn();
    render(<SuggestionList {...baseProps} onAccept={onAccept} />);

    const acceptButtons = screen.getAllByLabelText("接受建议");
    fireEvent.click(acceptButtons[0]);
    expect(onAccept).toHaveBeenCalledWith("s1");
  });

  it("should_call_onReject_with_id_when_reject_button_clicked", () => {
    const onReject = vi.fn();
    render(<SuggestionList {...baseProps} onReject={onReject} />);

    const rejectButtons = screen.getAllByLabelText("拒绝建议");
    fireEvent.click(rejectButtons[1]);
    expect(onReject).toHaveBeenCalledWith("s2");
  });

  it("should_show_empty_message_when_no_suggestions", () => {
    render(<SuggestionList {...baseProps} suggestions={[]} />);

    expect(screen.getByText("暂无建议")).toBeTruthy();
  });

  it("should_call_onClose_when_close_button_clicked", () => {
    const onClose = vi.fn();
    render(<SuggestionList {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("关闭"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should_use_payload_description_when_reason_is_missing", () => {
    const suggestions: Suggestion[] = [
      {
        id: "s3",
        suggestion_type: "rename",
        payload: { description: "建议重命名为更准确的标题" },
        status: "pending",
        created_at: "2026-04-12T00:00:00Z",
      },
    ];
    render(<SuggestionList {...baseProps} suggestions={suggestions} />);

    expect(screen.getByText("建议重命名为更准确的标题")).toBeTruthy();
  });

  it("should_show_default_text_when_payload_has_no_reason_or_description", () => {
    const suggestions: Suggestion[] = [
      {
        id: "s4",
        suggestion_type: "archive",
        payload: {},
        status: "pending",
        created_at: "2026-04-12T00:00:00Z",
      },
    ];
    render(<SuggestionList {...baseProps} suggestions={suggestions} />);

    // "AI 建议"出现在标题和 fallback 描述中，至少有 2 个匹配
    const matches = screen.getAllByText("AI 建议");
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
