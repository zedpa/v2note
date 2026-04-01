import { describe, it, expect } from "vitest";
import { Semaphore, Priority, SemaphoreTimeoutError } from "./semaphore.js";
describe("Semaphore", () => {
    // ── 场景 1: 排队超时自动拒绝 ──
    it("should_throw_SemaphoreTimeoutError_when_waiting_exceeds_timeout", async () => {
        const sem = new Semaphore(1);
        // 占满信号量
        const blocker = sem.acquire(() => new Promise((r) => setTimeout(r, 5000)));
        // 第二个请求应该超时
        await expect(sem.acquire(() => Promise.resolve("ok"), { timeout: 100 })).rejects.toThrow(SemaphoreTimeoutError);
        // 清理：让 blocker 完成（提前 resolve 不影响测试结果）
    });
    it("should_include_wait_time_and_pending_count_in_timeout_error", async () => {
        const sem = new Semaphore(1);
        const blocker = sem.acquire(() => new Promise((r) => setTimeout(r, 5000)));
        try {
            await sem.acquire(() => Promise.resolve("ok"), { timeout: 50 });
            expect.fail("should have thrown");
        }
        catch (err) {
            expect(err).toBeInstanceOf(SemaphoreTimeoutError);
            const e = err;
            expect(e.waited).toBeGreaterThanOrEqual(40); // 允许定时器偏差
            expect(e.pending).toBeGreaterThanOrEqual(0);
        }
    });
    // ── 场景 2: 正常排队通过 ──
    it("should_acquire_normally_when_slot_frees_before_timeout", async () => {
        const sem = new Semaphore(1);
        // 占 100ms 后释放
        sem.acquire(() => new Promise((r) => setTimeout(r, 50)));
        const result = await sem.acquire(() => Promise.resolve("ok"), { timeout: 5000 });
        expect(result).toBe("ok");
    });
    // ── 场景 3: 实时聊天优先于后台任务 ──
    it("should_prioritize_HIGH_over_NORMAL_in_queue", async () => {
        const sem = new Semaphore(1);
        const order = [];
        // 占满信号量
        const blocker = new Promise((resolve) => {
            sem.acquire(async () => {
                await new Promise((r) => setTimeout(r, 100));
                resolve();
            });
        });
        // 先排队 3 个 NORMAL
        const n1 = sem.acquire(async () => { order.push("normal1"); }, { priority: Priority.NORMAL, timeout: 5000 });
        const n2 = sem.acquire(async () => { order.push("normal2"); }, { priority: Priority.NORMAL, timeout: 5000 });
        const n3 = sem.acquire(async () => { order.push("normal3"); }, { priority: Priority.NORMAL, timeout: 5000 });
        // 再排队 1 个 HIGH — 应该插队到 NORMAL 前面
        const h1 = sem.acquire(async () => { order.push("high1"); }, { priority: Priority.HIGH, timeout: 5000 });
        await Promise.all([n1, n2, n3, h1]);
        expect(order[0]).toBe("high1");
    });
    // ── 场景 4: 同优先级保持 FIFO ──
    it("should_maintain_FIFO_within_same_priority", async () => {
        const sem = new Semaphore(1);
        const order = [];
        const blocker = new Promise((resolve) => {
            sem.acquire(async () => {
                await new Promise((r) => setTimeout(r, 100));
                resolve();
            });
        });
        const a = sem.acquire(async () => { order.push("a"); }, { priority: Priority.NORMAL, timeout: 5000 });
        const b = sem.acquire(async () => { order.push("b"); }, { priority: Priority.NORMAL, timeout: 5000 });
        const c = sem.acquire(async () => { order.push("c"); }, { priority: Priority.NORMAL, timeout: 5000 });
        await Promise.all([a, b, c]);
        expect(order).toEqual(["a", "b", "c"]);
    });
    // ── 场景 7: 超时不影响正在运行的任务 ──
    it("should_not_affect_running_tasks_when_queued_request_times_out", async () => {
        const sem = new Semaphore(2);
        const results = [];
        // 2 个正在运行的任务
        const r1 = sem.acquire(async () => {
            await new Promise((r) => setTimeout(r, 200));
            results.push("running1");
            return "done1";
        });
        const r2 = sem.acquire(async () => {
            await new Promise((r) => setTimeout(r, 200));
            results.push("running2");
            return "done2";
        });
        // 第 3 个应该超时
        const r3 = sem.acquire(() => Promise.resolve("ok"), { timeout: 50 }).catch((e) => {
            expect(e).toBeInstanceOf(SemaphoreTimeoutError);
            return "timeout";
        });
        const [v1, v2, v3] = await Promise.all([r1, r2, r3]);
        expect(v1).toBe("done1");
        expect(v2).toBe("done2");
        expect(v3).toBe("timeout");
        expect(results).toEqual(["running1", "running2"]);
    });
    // ── 边界: timeout=0 立即拒绝 ──
    it("should_reject_immediately_when_timeout_is_zero_and_semaphore_full", async () => {
        const sem = new Semaphore(1);
        sem.acquire(() => new Promise((r) => setTimeout(r, 5000)));
        await expect(sem.acquire(() => Promise.resolve("ok"), { timeout: 0 })).rejects.toThrow(SemaphoreTimeoutError);
    });
    // ── 边界: max=1 时优先级仍工作 ──
    it("should_work_with_max_1_and_priority_queue", async () => {
        const sem = new Semaphore(1);
        const order = [];
        const blocker = new Promise((resolve) => {
            sem.acquire(async () => {
                await new Promise((r) => setTimeout(r, 100));
                resolve();
            });
        });
        const n1 = sem.acquire(async () => { order.push("normal"); }, { priority: Priority.NORMAL, timeout: 5000 });
        const h1 = sem.acquire(async () => { order.push("high"); }, { priority: Priority.HIGH, timeout: 5000 });
        await Promise.all([n1, h1]);
        expect(order[0]).toBe("high");
    });
});
//# sourceMappingURL=semaphore.test.js.map