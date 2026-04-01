/**
 * 并发控制信号量（带超时 + 优先级）
 * 用于限制 DashScope API 等外部调用的并发数
 */

export enum Priority {
  HIGH = 0,   // 实时聊天、用户主动操作
  NORMAL = 1, // 后台 process、digest 等
}

export class SemaphoreTimeoutError extends Error {
  constructor(
    public readonly waited: number,
    public readonly pending: number,
  ) {
    super(`Semaphore timeout after ${waited}ms (${pending} still pending)`);
    this.name = "SemaphoreTimeoutError";
  }
}

interface QueueEntry {
  resolve: () => void;
  priority: Priority;
}

export class Semaphore {
  private queue: QueueEntry[] = [];
  private running = 0;

  constructor(private readonly max: number) {}

  async acquire<T>(
    fn: () => Promise<T>,
    opts?: { timeout?: number; priority?: Priority },
  ): Promise<T> {
    const timeout = opts?.timeout ?? 30_000;
    const priority = opts?.priority ?? Priority.NORMAL;

    if (this.running >= this.max) {
      const startTime = Date.now();

      await new Promise<void>((resolve, reject) => {
        const entry: QueueEntry = { resolve, priority };

        // 插入到正确的位置（HIGH 排在 NORMAL 前面，同优先级 FIFO）
        let inserted = false;
        if (priority === Priority.HIGH) {
          // 找到第一个 NORMAL 的位置，插在它前面
          const idx = this.queue.findIndex((e) => e.priority > priority);
          if (idx !== -1) {
            this.queue.splice(idx, 0, entry);
            inserted = true;
          }
        }
        if (!inserted) {
          this.queue.push(entry);
        }

        // 超时处理
        const timer = setTimeout(() => {
          const idx = this.queue.indexOf(entry);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            reject(new SemaphoreTimeoutError(Date.now() - startTime, this.queue.length));
          }
        }, timeout);

        // 包装 resolve 以清除定时器
        const originalResolve = entry.resolve;
        entry.resolve = () => {
          clearTimeout(timer);
          originalResolve();
        };
      });
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next.resolve();
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
