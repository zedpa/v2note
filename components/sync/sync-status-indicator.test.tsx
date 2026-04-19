/**
 * SyncStatusIndicator 单元测试
 *
 * regression: fix-cold-resume-silent-loss (Phase 7 §5.1)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SyncStatusIndicator } from "./sync-status-indicator";

describe("SyncStatusIndicator [regression: fix-cold-resume-silent-loss]", () => {
  it("should_render_hourglass_for_captured_and_syncing", () => {
    const { rerender } = render(<SyncStatusIndicator status="captured" />);
    expect(screen.getByTestId("sync-status-indicator").textContent).toContain(
      "⏳",
    );
    expect(
      screen.getByTestId("sync-status-indicator").getAttribute("data-status"),
    ).toBe("captured");

    rerender(<SyncStatusIndicator status="syncing" />);
    expect(screen.getByTestId("sync-status-indicator").textContent).toContain(
      "⏳",
    );
    expect(
      screen.getByTestId("sync-status-indicator").getAttribute("data-status"),
    ).toBe("syncing");
  });

  it("should_render_nothing_for_synced", () => {
    const { container } = render(<SyncStatusIndicator status="synced" />);
    expect(container.firstChild).toBeNull();
  });

  it("should_render_nothing_for_failed_when_retryCount_lt_5", () => {
    for (const rc of [0, 1, 2, 3, 4]) {
      const { container, unmount } = render(
        <SyncStatusIndicator status="failed" retryCount={rc} />,
      );
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });

  it("should_render_red_warning_for_failed_when_retryCount_gte_5", () => {
    render(<SyncStatusIndicator status="failed" retryCount={5} />);
    const el = screen.getByTestId("sync-status-indicator");
    expect(el.getAttribute("data-status")).toBe("failed-permanent");
    expect(el.textContent).toContain("⚠");
  });

  it("should_call_onRetry_when_retry_button_clicked", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn();
    render(
      <SyncStatusIndicator
        status="failed"
        retryCount={5}
        onRetry={onRetry}
        onDelete={onDelete}
      />,
    );

    // 先展开面板
    fireEvent.click(screen.getByLabelText("同步失败，点击查看详情"));
    const retryBtn = screen.getByTestId("sync-retry");
    fireEvent.click(retryBtn);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("should_call_onDelete_when_delete_button_clicked", async () => {
    const onRetry = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <SyncStatusIndicator
        status="failed"
        retryCount={7}
        lastError="auth_refresh_exhausted"
        onRetry={onRetry}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByLabelText("同步失败，点击查看详情"));
    // 面板应显示 lastError
    expect(screen.getByText(/auth_refresh_exhausted/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("sync-delete"));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("should_close_panel_when_pointerdown_outside [M6]", () => {
    render(
      <div>
        <SyncStatusIndicator
          status="failed"
          retryCount={5}
          onRetry={vi.fn()}
          onDelete={vi.fn()}
        />
        <div data-testid="outside">outside</div>
      </div>,
    );
    const btn = screen.getByLabelText("同步失败，点击查看详情");
    // 展开
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");

    // 组件外部 pointerdown 关闭
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("should_close_panel_when_escape_pressed [M6]", () => {
    render(
      <SyncStatusIndicator
        status="failed"
        retryCount={5}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const btn = screen.getByLabelText("同步失败，点击查看详情");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("should_toggle_panel_visibility_when_warning_icon_clicked", () => {
    render(
      <SyncStatusIndicator
        status="failed"
        retryCount={5}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const btn = screen.getByLabelText("同步失败，点击查看详情");

    // 默认关闭
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("sync-retry")).toBeNull();

    // 点击展开
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("sync-retry")).toBeTruthy();

    // 再点击收起
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });
});
