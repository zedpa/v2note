/**
 * 并发控制信号量
 * 用于限制 DashScope API 等外部调用的并发数
 */
export class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private readonly max: number) {}

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  /** 当前排队数 */
  get pending(): number {
    return this.queue.length;
  }

  /** 当前运行数 */
  get active(): number {
    return this.running;
  }
}
