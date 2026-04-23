/**
 * guest-session 单元测试
 *
 * regression: fix-cold-resume-silent-loss (Phase 8)
 *
 * 覆盖 spec 场景：
 *   §4.3 未登录用户的捕获必须携带 guestBatchId（同一设备/会话内保持稳定）
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getOrCreateGuestBatchId,
  clearGuestBatchId,
  GUEST_BATCH_KEY,
} from "./guest-session";

describe("guest-session [regression: fix-cold-resume-silent-loss]", () => {
  beforeEach(() => {
    // 清掉 localStorage 隔离每个测试
    try {
      localStorage.removeItem(GUEST_BATCH_KEY);
    } catch {
      // 某些环境可能没 localStorage，测试本身不需要
    }
  });

  it("should_create_new_batch_id_when_localStorage_empty", () => {
    const id = getOrCreateGuestBatchId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    // UUID-ish：至少 8 字节的随机串
    expect(id.length).toBeGreaterThanOrEqual(8);
    // localStorage 中确实已持久化
    expect(localStorage.getItem(GUEST_BATCH_KEY)).toBe(id);
  });

  it("should_return_same_batch_id_on_subsequent_calls", () => {
    const a = getOrCreateGuestBatchId();
    const b = getOrCreateGuestBatchId();
    const c = getOrCreateGuestBatchId();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("should_clear_batch_id", () => {
    const a = getOrCreateGuestBatchId();
    expect(a).toBeTruthy();
    clearGuestBatchId();
    expect(localStorage.getItem(GUEST_BATCH_KEY)).toBeNull();

    // 清理后再请求应生成一个"不同"的新 id
    const b = getOrCreateGuestBatchId();
    expect(b).toBeTruthy();
    expect(b).not.toBe(a);
  });

  it("should_be_safe_when_localStorage_unavailable", () => {
    // 模拟 localStorage 访问抛错：save 到原始，替换为 throwing proxy
    const originalStorage = globalThis.localStorage;
    const throwingStorage = {
      getItem() {
        throw new Error("localStorage blocked");
      },
      setItem() {
        throw new Error("localStorage blocked");
      },
      removeItem() {
        throw new Error("localStorage blocked");
      },
      clear() {},
      key() {
        return null;
      },
      length: 0,
    } as unknown as Storage;
    try {
      Object.defineProperty(globalThis, "localStorage", {
        value: throwingStorage,
        configurable: true,
      });

      // 不应抛错，返回一个内存 id（仍有效，仅不持久化）
      const id = getOrCreateGuestBatchId();
      expect(id).toBeTruthy();

      // clear 也不应抛
      expect(() => clearGuestBatchId()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalStorage,
        configurable: true,
      });
    }
  });
});
