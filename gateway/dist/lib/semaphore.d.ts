/**
 * 并发控制信号量（带超时 + 优先级）
 * 用于限制 DashScope API 等外部调用的并发数
 */
export declare enum Priority {
    HIGH = 0,// 实时聊天、用户主动操作
    NORMAL = 1
}
export declare class SemaphoreTimeoutError extends Error {
    readonly waited: number;
    readonly pending: number;
    constructor(waited: number, pending: number);
}
export declare class Semaphore {
    private readonly max;
    private queue;
    private running;
    constructor(max: number);
    acquire<T>(fn: () => Promise<T>, opts?: {
        timeout?: number;
        priority?: Priority;
    }): Promise<T>;
    /** 当前排队数 */
    get pending(): number;
    /** 当前运行数 */
    get active(): number;
}
