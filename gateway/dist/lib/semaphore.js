/**
 * 并发控制信号量（带超时 + 优先级）
 * 用于限制 DashScope API 等外部调用的并发数
 */
export var Priority;
(function (Priority) {
    Priority[Priority["HIGH"] = 0] = "HIGH";
    Priority[Priority["NORMAL"] = 1] = "NORMAL";
})(Priority || (Priority = {}));
export class SemaphoreTimeoutError extends Error {
    waited;
    pending;
    constructor(waited, pending) {
        super(`Semaphore timeout after ${waited}ms (${pending} still pending)`);
        this.waited = waited;
        this.pending = pending;
        this.name = "SemaphoreTimeoutError";
    }
}
export class Semaphore {
    max;
    queue = [];
    running = 0;
    constructor(max) {
        this.max = max;
    }
    async acquire(fn, opts) {
        const timeout = opts?.timeout ?? 30_000;
        const priority = opts?.priority ?? Priority.NORMAL;
        if (this.running >= this.max) {
            const startTime = Date.now();
            await new Promise((resolve, reject) => {
                const entry = { resolve, priority };
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
        }
        finally {
            this.running--;
            const next = this.queue.shift();
            if (next)
                next.resolve();
        }
    }
    /** 当前排队数 */
    get pending() {
        return this.queue.length;
    }
    /** 当前运行数 */
    get active() {
        return this.running;
    }
}
//# sourceMappingURL=semaphore.js.map