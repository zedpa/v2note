import { describe, it, expect, vi } from "vitest";

/**
 * 测试 chat stream 的超时保护和空响应处理
 * 根因：for-await stream 无超时 → AI 挂起时 chat.done 永不发送
 */

// 提取为独立可测试的工具函数
import { iterateStreamWithTimeout, STREAM_TIMEOUT_MS } from "../lib/stream-utils.js";

describe("iterateStreamWithTimeout — stream 超时保护", () => {
  it("should_collect_all_chunks_from_normal_stream", async () => {
    async function* normalStream() {
      yield "hello ";
      yield "world";
    }
    const chunks: string[] = [];
    await iterateStreamWithTimeout(normalStream(), (chunk) => {
      chunks.push(chunk);
    });
    expect(chunks).toEqual(["hello ", "world"]);
  });

  it("should_timeout_when_stream_hangs", async () => {
    async function* hangingStream() {
      yield "first";
      // 永远不产出第二个 chunk
      await new Promise(() => {}); // 永久挂起
    }

    const chunks: string[] = [];
    // 使用短超时测试
    await expect(
      iterateStreamWithTimeout(hangingStream(), (chunk) => {
        chunks.push(chunk);
      }, 100), // 100ms 超时
    ).rejects.toThrow("Stream timeout");

    expect(chunks).toEqual(["first"]); // 第一个 chunk 应该被收到
  });

  it("should_handle_empty_stream_gracefully", async () => {
    async function* emptyStream() {
      // 不产出任何 chunk
    }
    const chunks: string[] = [];
    await iterateStreamWithTimeout(emptyStream(), (chunk) => {
      chunks.push(chunk);
    });
    expect(chunks).toEqual([]);
  });

  it("should_propagate_stream_errors", async () => {
    async function* errorStream() {
      yield "ok";
      throw new Error("AI provider error");
    }
    const chunks: string[] = [];
    await expect(
      iterateStreamWithTimeout(errorStream(), (chunk) => {
        chunks.push(chunk);
      }),
    ).rejects.toThrow("AI provider error");
    expect(chunks).toEqual(["ok"]);
  });

  it("should_have_default_timeout_of_60_seconds", () => {
    expect(STREAM_TIMEOUT_MS).toBe(60000);
  });
});
