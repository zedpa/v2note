/**
 * pending-frames 单元测试
 *
 * regression: fix-cold-resume-silent-loss §7.1
 */

import { describe, it, expect } from "vitest";
import {
  PendingControlFramesQueue,
  BEST_EFFORT_CAPACITY,
  isBestEffort,
  isUnboundedKeep,
  type ControlFrameType,
} from "./pending-frames";

function frame(
  type: ControlFrameType,
  payload: Record<string, unknown> = {},
): { type: ControlFrameType; payload: Record<string, unknown> } {
  return { type, payload };
}

describe("PendingControlFramesQueue [regression: fix-cold-resume-silent-loss §7.1]", () => {
  describe("classification", () => {
    it("should_classify_must_keep_types_as_unboundedKeep", () => {
      expect(isUnboundedKeep("chat.message")).toBe(true);
      expect(isUnboundedKeep("chat.user")).toBe(true);
      expect(isUnboundedKeep("asr.start")).toBe(true);
      expect(isUnboundedKeep("asr.stop")).toBe(true);
    });

    it("should_classify_best_effort_types", () => {
      expect(isBestEffort("asr.cancel")).toBe(true);
      expect(isBestEffort("asr.partial-hint")).toBe(true);
      expect(isBestEffort("heartbeat")).toBe(true);
      expect(isBestEffort("read-receipt")).toBe(true);
    });
  });

  describe("enqueue priority", () => {
    it("should_enqueue_must_keep_frames_without_capacity_limit", () => {
      const q = new PendingControlFramesQueue();
      for (let i = 0; i < 100; i++) {
        q.enqueue(frame("chat.user", { client_id: `c-${i}` }));
      }
      expect(q.size()).toBe(100);
    });

    it("should_drop_oldest_best_effort_when_exceeding_capacity", () => {
      const q = new PendingControlFramesQueue();
      for (let i = 0; i < BEST_EFFORT_CAPACITY + 5; i++) {
        q.enqueue(frame("heartbeat", { seq: i }));
      }
      expect(q.size()).toBe(BEST_EFFORT_CAPACITY);
      const snapshot = q.snapshot();
      // 最早的 5 个被丢弃，头部应是 seq=5
      expect((snapshot[0].raw.payload as { seq: number }).seq).toBe(5);
    });

    it("should_preserve_must_keep_when_best_effort_fills_capacity", () => {
      const q = new PendingControlFramesQueue();
      q.enqueue(frame("chat.user", { client_id: "c-critical" }));
      for (let i = 0; i < BEST_EFFORT_CAPACITY + 10; i++) {
        q.enqueue(frame("heartbeat", { seq: i }));
      }
      // 总数 = 1 必保留 + 50 bestEffort
      expect(q.size()).toBe(BEST_EFFORT_CAPACITY + 1);
      const keepFrames = q
        .snapshot()
        .filter((f) => f.priority === "keep");
      expect(keepFrames).toHaveLength(1);
      expect(keepFrames[0].clientId).toBe("c-critical");
    });
  });

  describe("sessionId 同生同灭", () => {
    it("should_clear_same_session_best_effort_when_cancel_enqueued", () => {
      const q = new PendingControlFramesQueue();
      q.enqueue(frame("asr.partial-hint", { sessionId: "s-1", idx: 1 }));
      q.enqueue(frame("asr.partial-hint", { sessionId: "s-1", idx: 2 }));
      q.enqueue(frame("asr.partial-hint", { sessionId: "s-2", idx: 3 })); // 另一个 session
      q.enqueue(frame("heartbeat", {})); // 无 sessionId
      expect(q.size()).toBe(4);

      q.enqueue(frame("asr.cancel", { sessionId: "s-1" }));

      // s-1 的两个 partial-hint 被清空；s-2 / 无 session 的 heartbeat 保留；asr.cancel 自己入队
      const snap = q.snapshot();
      expect(snap).toHaveLength(3);
      // 断言：没有 s-1 的 partial-hint
      expect(
        snap.some(
          (f) => f.type === "asr.partial-hint" && f.sessionId === "s-1",
        ),
      ).toBe(false);
      // asr.cancel(s-1) 在
      expect(
        snap.some((f) => f.type === "asr.cancel" && f.sessionId === "s-1"),
      ).toBe(true);
    });

    it("should_void_session_and_reject_subsequent_stop_cancel", () => {
      const q = new PendingControlFramesQueue();
      q.enqueue(frame("asr.start", { sessionId: "s-1", client_id: "c-1" }));
      q.enqueue(frame("asr.stop", { sessionId: "s-1" }));
      expect(q.size()).toBe(2);

      // 模拟 asr.start 被强制移除（如 401 refresh 失败后作废该 session）
      // 先取出 start 对应的 frame，再从 queue 中移除并 voidSession
      const startFrame = q.snapshot().find((f) => f.type === "asr.start");
      expect(startFrame).toBeDefined();
      q.dequeue(startFrame!);
      q.voidSession("s-1");

      // 队列中原来的 asr.stop 应被清除
      expect(q.snapshot().some((f) => f.type === "asr.stop")).toBe(false);

      // 再入队同 sessionId 的 asr.stop → 应被拒绝
      const ok = q.enqueue(frame("asr.stop", { sessionId: "s-1" }));
      expect(ok).toBe(false);
      expect(q.size()).toBe(0);

      // 其他 sessionId 不受影响
      const ok2 = q.enqueue(frame("asr.stop", { sessionId: "s-2" }));
      expect(ok2).toBe(true);
    });
  });

  describe("FIFO 顺序", () => {
    it("should_preserve_insertion_order_for_mixed_priorities", () => {
      const q = new PendingControlFramesQueue();
      q.enqueue(frame("asr.start", { sessionId: "s-1", client_id: "c-1" }));
      q.enqueue(frame("heartbeat", { seq: 1 }));
      q.enqueue(frame("asr.stop", { sessionId: "s-1" }));
      q.enqueue(frame("heartbeat", { seq: 2 }));

      const order = q.snapshot().map((f) => f.type);
      expect(order).toEqual([
        "asr.start",
        "heartbeat",
        "asr.stop",
        "heartbeat",
      ]);
    });

    it("should_reject_unknown_types", () => {
      const q = new PendingControlFramesQueue();
      const ok = q.enqueue({
        type: "process" as ControlFrameType,
        payload: {},
      });
      expect(ok).toBe(false);
      expect(q.size()).toBe(0);
    });
  });

  describe("peek / dequeue / markAwaitingAck", () => {
    it("should_peek_head_without_removing", () => {
      const q = new PendingControlFramesQueue();
      q.enqueue(frame("chat.user", { client_id: "c-1" }));
      q.enqueue(frame("chat.user", { client_id: "c-2" }));
      expect(q.peek()?.clientId).toBe("c-1");
      expect(q.size()).toBe(2);
    });

    it("should_dequeue_specific_frame_by_reference", () => {
      const q = new PendingControlFramesQueue();
      q.enqueue(frame("chat.user", { client_id: "c-1" }));
      q.enqueue(frame("chat.user", { client_id: "c-2" }));
      const head = q.peek()!;
      q.dequeue(head);
      expect(q.size()).toBe(1);
      expect(q.peek()?.clientId).toBe("c-2");
    });

    it("should_mark_awaiting_ack_flag", () => {
      const q = new PendingControlFramesQueue();
      q.enqueue(frame("chat.user", { client_id: "c-1" }));
      const head = q.peek()!;
      q.markAwaitingAck(head, true);
      expect(q.peek()?.awaitingAck).toBe(true);
    });
  });

  describe("clear", () => {
    it("should_reset_queue_and_voided_sessions", () => {
      const q = new PendingControlFramesQueue();
      q.enqueue(frame("asr.start", { sessionId: "s-1" }));
      const f = q.peek()!;
      q.dequeue(f);
      q.voidSession("s-1");
      q.clear();
      expect(q.size()).toBe(0);
      // clear 后再入队同 sessionId 的 stop → 应允许
      expect(q.enqueue(frame("asr.stop", { sessionId: "s-1" }))).toBe(true);
    });
  });
});
