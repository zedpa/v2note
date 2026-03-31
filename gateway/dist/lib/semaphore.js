/**
 * 并发控制信号量
 * 用于限制 DashScope API 等外部调用的并发数
 */
export class Semaphore {
    max;
    queue = [];
    running = 0;
    constructor(max) {
        this.max = max;
    }
    async acquire(fn) {
        if (this.running >= this.max) {
            await new Promise((resolve) => this.queue.push(resolve));
        }
        this.running++;
        try {
            return await fn();
        }
        finally {
            this.running--;
            const next = this.queue.shift();
            if (next)
                next();
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