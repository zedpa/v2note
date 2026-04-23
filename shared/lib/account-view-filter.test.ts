/**
 * regression: fix-cold-resume-silent-loss §7.4
 * 账号视图严格隔离（防跨账号 / 跨 guest session 泄漏）
 */
import { describe, it, expect } from "vitest";
import {
  filterCapturesByAccountView,
  isCaptureVisibleInView,
} from "./account-view-filter";

type Row = { id: string; userId: string | null; guestBatchId: string | null };

const rows: Row[] = [
  { id: "A-own", userId: "userA", guestBatchId: null },
  { id: "A-legacy-null", userId: null, guestBatchId: "batch-old" },
  { id: "B-own", userId: "userB", guestBatchId: null },
  { id: "guest-current", userId: null, guestBatchId: "batch-now" },
  { id: "guest-other", userId: null, guestBatchId: "batch-other" },
  { id: "guest-no-batch", userId: null, guestBatchId: null },
];

describe("filterCapturesByAccountView [regression: fix-cold-resume-silent-loss]", () => {
  it("should_show_only_current_user_and_current_guest_session_when_logged_in", () => {
    const visible = filterCapturesByAccountView(rows, {
      currentUserId: "userA",
      currentSessionBatchId: "batch-now",
    }).map((r) => r.id);
    expect(visible.sort()).toEqual(["A-own", "guest-current"]);
  });

  it("should_hide_other_account_captures_in_logged_in_view", () => {
    const visible = filterCapturesByAccountView(rows, {
      currentUserId: "userA",
      currentSessionBatchId: "batch-now",
    }).map((r) => r.id);
    expect(visible).not.toContain("B-own");
    expect(visible).not.toContain("A-legacy-null"); // 上个 session 遗留
    expect(visible).not.toContain("guest-other"); // 其他 guest session 遗留
    expect(visible).not.toContain("guest-no-batch"); // 僵尸条目
  });

  it("should_show_only_current_session_guest_entries_when_not_logged_in", () => {
    const visible = filterCapturesByAccountView(rows, {
      currentUserId: null,
      currentSessionBatchId: "batch-now",
    }).map((r) => r.id);
    expect(visible).toEqual(["guest-current"]);
  });

  it("should_hide_all_captures_when_not_logged_in_and_no_session_batch", () => {
    // guest-session 尚未初始化 batch id → 出于安全全部拒显
    const visible = filterCapturesByAccountView(rows, {
      currentUserId: null,
      currentSessionBatchId: null,
    });
    expect(visible).toEqual([]);
  });

  it("should_hide_user_scoped_captures_from_not_logged_in_view", () => {
    const visible = filterCapturesByAccountView(rows, {
      currentUserId: null,
      currentSessionBatchId: "batch-now",
    }).map((r) => r.id);
    expect(visible).not.toContain("A-own");
    expect(visible).not.toContain("B-own");
  });

  it("should_expose_single_row_api_for_component_level_checks", () => {
    expect(
      isCaptureVisibleInView(
        { userId: "userB", guestBatchId: null },
        { currentUserId: "userA", currentSessionBatchId: "batch-now" },
      ),
    ).toBe(false);
    expect(
      isCaptureVisibleInView(
        { userId: null, guestBatchId: "batch-now" },
        { currentUserId: "userA", currentSessionBatchId: "batch-now" },
      ),
    ).toBe(true);
  });

  it("should_preserve_order_of_input_list", () => {
    const input: Row[] = [
      { id: "x", userId: "userA", guestBatchId: null },
      { id: "y", userId: "userA", guestBatchId: null },
      { id: "z", userId: null, guestBatchId: "batch-now" },
    ];
    const out = filterCapturesByAccountView(input, {
      currentUserId: "userA",
      currentSessionBatchId: "batch-now",
    });
    expect(out.map((r) => r.id)).toEqual(["x", "y", "z"]);
  });
});
