/**
 * logout-flow 单元测试
 *
 * regression: fix-cold-resume-silent-loss (Phase 8, spec §4.3a)
 */

import { describe, it, expect } from "vitest";
import { decideLogoutAction, buildLogoutConfirmMessage } from "./logout-flow";

describe("decideLogoutAction [regression: fix-cold-resume-silent-loss Phase 8]", () => {
  it("should_proceed_when_no_unsynced_captures", () => {
    const res = decideLogoutAction({
      userOwnedUnsyncedCount: 0,
      online: true,
      flushTimedOut: false,
    });
    expect(res).toEqual({ action: "proceed" });
  });

  it("should_proceed_when_no_unsynced_even_when_offline", () => {
    const res = decideLogoutAction({
      userOwnedUnsyncedCount: 0,
      online: false,
      flushTimedOut: true,
    });
    expect(res).toEqual({ action: "proceed" });
  });

  it("should_block_with_offline_reason_when_offline_and_unsynced", () => {
    const res = decideLogoutAction({
      userOwnedUnsyncedCount: 3,
      online: false,
      flushTimedOut: false,
    });
    expect(res).toEqual({ action: "block", unsyncedCount: 3, reason: "offline" });
  });

  it("should_block_with_timeout_reason_when_flush_timed_out", () => {
    const res = decideLogoutAction({
      userOwnedUnsyncedCount: 2,
      online: true,
      flushTimedOut: true,
    });
    expect(res).toEqual({ action: "block", unsyncedCount: 2, reason: "timeout" });
  });

  it("should_block_with_push_failed_when_online_but_still_unsynced", () => {
    const res = decideLogoutAction({
      userOwnedUnsyncedCount: 1,
      online: true,
      flushTimedOut: false,
    });
    expect(res).toEqual({ action: "block", unsyncedCount: 1, reason: "push_failed" });
  });

  it("should_cancel_when_user_chose_cancel", () => {
    const res = decideLogoutAction({
      userOwnedUnsyncedCount: 5,
      online: false,
      flushTimedOut: true,
      userChoice: "cancel",
    });
    expect(res).toEqual({ action: "cancel" });
  });

  it("should_proceed_when_user_chose_confirm_despite_unsynced", () => {
    // 用户点了"确认登出"即使还有未同步，也继续（数据保留本地）
    const res = decideLogoutAction({
      userOwnedUnsyncedCount: 5,
      online: false,
      flushTimedOut: true,
      userChoice: "confirm",
    });
    expect(res).toEqual({ action: "proceed" });
  });
});

describe("buildLogoutConfirmMessage", () => {
  it("should_include_count_and_local_retention_guidance", () => {
    const msg = buildLogoutConfirmMessage(7);
    expect(msg).toContain("7");
    expect(msg).toContain("本设备");
    expect(msg).toContain("重新登录");
  });
});
