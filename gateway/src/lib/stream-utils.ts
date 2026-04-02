/**
 * Stream 超时保护工具
 * 解决 for-await-of async generator 挂起时无法超时的问题
 */

export const STREAM_TIMEOUT_MS = 60_000; // 60 秒硬超时

/**
 * 带超时保护的 stream 迭代
 * - 正常 stream：逐 chunk 回调，正常完成
 * - stream 挂起：超过 timeoutMs 后抛 StreamTimeoutError
 * - stream 出错：透传原始错误
 * - 空 stream：正常完成，不报错
 */
export async function iterateStreamWithTimeout(
  stream: AsyncIterable<string>,
  onChunk: (chunk: string) => void,
  timeoutMs: number = STREAM_TIMEOUT_MS,
): Promise<void> {
  const iterator = stream[Symbol.asyncIterator]();
  let done = false;

  while (!done) {
    const result = await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new StreamTimeoutError(timeoutMs)), timeoutMs),
      ),
    ]);

    if (result.done) {
      done = true;
    } else {
      onChunk(result.value);
    }
  }
}

export class StreamTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Stream timeout after ${timeoutMs}ms`);
    this.name = "StreamTimeoutError";
  }
}
