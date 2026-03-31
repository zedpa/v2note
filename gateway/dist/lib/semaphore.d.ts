/**
 * 并发控制信号量
 * 用于限制 DashScope API 等外部调用的并发数
 */
export declare class Semaphore {
    private readonly max;
    private queue;
    private running;
    constructor(max: number);
    acquire<T>(fn: () => Promise<T>): Promise<T>;
    /** 当前排队数 */
    get pending(): number;
    /** 当前运行数 */
    get active(): number;
}
