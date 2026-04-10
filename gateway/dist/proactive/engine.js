/**
 * Proactive Push Engine — checks connected devices' todo state
 * and sends reminders via WebSocket.
 *
 * Enhanced with BullMQ for persistent, Redis-backed job scheduling.
 * Gracefully falls back to setInterval when Redis is unavailable.
 *
 * BullMQ advantages over setInterval:
 * - Persistent jobs survive gateway restarts
 * - Precise cron scheduling (7:30 AM, 2:00 PM, 8:00 PM)
 * - Built-in retry with exponential backoff
 * - Multi-process safe (multiple gateways share one queue)
 */
import { WebSocket } from "ws";
import { todoRepo, recordRepo, notificationRepo } from "../db/repositories/index.js";
import * as dailyBriefingRepo from "../db/repositories/daily-briefing.js";
import { regenerateSummary, extractToMemory } from "../diary/manager.js";
import { digestRecords } from "../handlers/digest.js";
import { runDailyCognitiveCycle } from "../cognitive/daily-cycle.js";
import { generateMorningBriefing, generateEveningSummary } from "../handlers/daily-loop.js";
import { fmt } from "../lib/date-anchor.js";
import { now as tzNow } from "../lib/tz.js";
import { addDays as dfAddDays } from "date-fns";
export class ProactiveEngine {
    devices = new Map();
    intervalMs = 30 * 60 * 1000; // 30 minutes
    dailyPushSent = new Set();
    // Fallback timer (used when Redis unavailable)
    fallbackTimer = null;
    digestTimer = null;
    cognitiveDailyTimer = null;
    emergenceWeeklyTimer = null;
    // BullMQ instances (populated if Redis is available)
    queue = null;
    worker = null;
    redisAvailable = false;
    setInterval(minutes) {
        this.intervalMs = minutes * 60 * 1000;
        if (this.fallbackTimer) {
            this.stop();
            this.start();
        }
    }
    registerDevice(deviceId, ws, userId) {
        this.devices.set(deviceId, { deviceId, userId, ws, lastNudge: 0 });
        console.log(`[proactive] Device registered: ${deviceId} (total: ${this.devices.size})`);
        // Register per-device BullMQ schedulers if Redis is available
        if (this.redisAvailable && this.queue) {
            this.registerDeviceSchedulers(deviceId).catch((err) => {
                console.warn(`[proactive] Failed to register device schedulers: ${err.message}`);
            });
        }
    }
    setDeviceUserId(deviceId, userId) {
        const device = this.devices.get(deviceId);
        if (device)
            device.userId = userId;
    }
    unregisterDevice(deviceId) {
        this.devices.delete(deviceId);
        console.log(`[proactive] Device unregistered: ${deviceId} (total: ${this.devices.size})`);
    }
    unregisterByWs(ws) {
        for (const [deviceId, device] of this.devices) {
            if (device.ws === ws) {
                this.devices.delete(deviceId);
                console.log(`[proactive] Device unregistered by ws: ${deviceId}`);
                break;
            }
        }
    }
    /**
     * Start the engine. Tries BullMQ first, falls back to setInterval.
     */
    async start() {
        try {
            await this.tryStartBullMQ();
        }
        catch (err) {
            console.warn(`[proactive] BullMQ unavailable (${err.message}), using fallback timer`);
            this.startFallbackTimer();
        }
    }
    stop() {
        if (this.fallbackTimer) {
            clearInterval(this.fallbackTimer);
            this.fallbackTimer = null;
        }
        if (this.digestTimer) {
            clearInterval(this.digestTimer);
            this.digestTimer = null;
        }
        if (this.cognitiveDailyTimer) {
            clearInterval(this.cognitiveDailyTimer);
            this.cognitiveDailyTimer = null;
        }
        if (this.emergenceWeeklyTimer) {
            clearInterval(this.emergenceWeeklyTimer);
            this.emergenceWeeklyTimer = null;
        }
        if (this.worker) {
            this.worker.close().catch(() => { });
            this.worker = null;
        }
        if (this.queue) {
            this.queue.close().catch(() => { });
            this.queue = null;
        }
        this.redisAvailable = false;
        console.log("[proactive] Engine stopped");
    }
    // ── BullMQ setup ──
    async tryStartBullMQ() {
        // Dynamic import to avoid hard dependency
        const { Queue, Worker } = await import("bullmq");
        const redisHost = process.env.REDIS_HOST || "localhost";
        const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
        const redisPassword = process.env.REDIS_PASSWORD;
        // Use plain connection config (avoids ioredis version mismatch with bullmq's internal copy)
        const connectionConfig = { host: redisHost, port: redisPort, password: redisPassword };
        // Test Redis connectivity with a raw TCP check (fast-fail, 3s timeout)
        const net = await import("node:net");
        await new Promise((resolve, reject) => {
            const sock = net.createConnection({ host: redisHost, port: redisPort }, () => {
                sock.destroy();
                resolve();
            });
            sock.setTimeout(3000);
            sock.on("timeout", () => { sock.destroy(); reject(new Error(`Redis timeout ${redisHost}:${redisPort}`)); });
            sock.on("error", (err) => { sock.destroy(); reject(err); });
        });
        // Redis is available — setup BullMQ
        this.queue = new Queue("proactive-engine", {
            connection: connectionConfig,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 500 },
            },
        });
        this.worker = new Worker("proactive-engine", async (job) => {
            switch (job.name) {
                case "check-all-devices":
                    await this.checkAll();
                    break;
                case "morning-briefing":
                    await this.handleTimedPush(job.data.deviceId, "morning");
                    break;
                case "relay-reminder":
                    await this.handleTimedPush(job.data.deviceId, "relay");
                    break;
                case "evening-summary":
                    await this.handleTimedPush(job.data.deviceId, "evening");
                    break;
                case "cognitive-digest":
                    await this.runBatchDigest();
                    break;
                case "cognitive-daily":
                    await this.runCognitiveDaily();
                    break;
                case "cognitive-weekly-emergence":
                    await this.runWeeklyEmergence();
                    break;
            }
        }, { connection: connectionConfig, concurrency: 5 });
        this.worker.on("failed", (job, err) => {
            console.error(`[proactive:bullmq] ${job?.name} failed:`, err.message);
        });
        this.worker.on("error", (err) => {
            console.error(`[proactive:bullmq] Worker error:`, err.message);
        });
        // Setup repeatable schedulers (idempotent)
        await this.queue.upsertJobScheduler("check-all-scheduler", { every: this.intervalMs }, { name: "check-all-devices", data: {} });
        // Cognitive digest cron: every 3 hours, batch-digest unprocessed records
        await this.queue.upsertJobScheduler("cognitive-digest-scheduler", { pattern: "0 */3 * * *" }, { name: "cognitive-digest", data: {} });
        // Cognitive daily cycle: every day at 3 AM
        await this.queue.upsertJobScheduler("cognitive-daily-scheduler", { pattern: "0 3 * * *" }, { name: "cognitive-daily", data: {} });
        // Weekly emergence engine: every Sunday at 4 AM
        await this.queue.upsertJobScheduler("cognitive-weekly-emergence-scheduler", { pattern: "0 4 * * 0" }, { name: "cognitive-weekly-emergence", data: {} });
        this.redisAvailable = true;
        console.log(`[proactive] Engine started with BullMQ (Redis: ${redisHost}:${redisPort})`);
    }
    async registerDeviceSchedulers(deviceId) {
        if (!this.queue)
            return;
        await this.queue.upsertJobScheduler(`morning-${deviceId}`, { pattern: "30 7 * * *" }, { name: "morning-briefing", data: { deviceId } });
        await this.queue.upsertJobScheduler(`relay-${deviceId}`, { pattern: "0 14 * * *" }, { name: "relay-reminder", data: { deviceId } });
        await this.queue.upsertJobScheduler(`evening-${deviceId}`, { pattern: "0 20 * * *" }, { name: "evening-summary", data: { deviceId } });
    }
    async handleTimedPush(deviceId, type) {
        // BullMQ scheduled job: push to all connected devices or specific device
        const targets = deviceId
            ? [this.devices.get(deviceId)].filter(Boolean)
            : Array.from(this.devices.values());
        for (const device of targets) {
            if (device.ws.readyState !== WebSocket.OPEN)
                continue;
            switch (type) {
                case "morning": {
                    // 先预生成简报内容，用户打开 app 时无需等待
                    try {
                        await generateMorningBriefing(device.deviceId, device.userId);
                    }
                    catch (e) {
                        console.warn(`[proactive] Morning briefing pre-generate failed: ${e.message}`);
                    }
                    const mText = "新的一天开始了，查看今日简报";
                    this.sendMessage(device, {
                        type: "proactive.morning_briefing",
                        payload: { text: mText },
                    });
                    this.persistNotification(device, "proactive.morning_briefing", "晨间简报", mText);
                    break;
                }
                case "relay": {
                    try {
                        const relays = device.userId
                            ? await todoRepo.findRelayByUser(device.userId)
                            : await todoRepo.findRelayByDevice(device.deviceId);
                        if (relays.length > 0) {
                            const rText = `你有 ${relays.length} 条信息还需要转达`;
                            this.sendMessage(device, {
                                type: "proactive.relay_reminder",
                                payload: { text: rText, count: relays.length },
                            });
                            this.persistNotification(device, "proactive.relay_reminder", "转达提醒", rText);
                        }
                    }
                    catch { /* table may not exist */ }
                    break;
                }
                case "evening": {
                    // 先预生成晚报内容
                    try {
                        await generateEveningSummary(device.deviceId, device.userId);
                    }
                    catch (e) {
                        console.warn(`[proactive] Evening summary pre-generate failed: ${e.message}`);
                    }
                    const eText = "今天辛苦了，看看日终总结";
                    this.sendMessage(device, {
                        type: "proactive.evening_summary",
                        payload: { text: eText },
                    });
                    this.persistNotification(device, "proactive.evening_summary", "日终总结", eText);
                    // Regenerate diary summaries for today
                    const todayStr = fmt(tzNow());
                    regenerateSummary(device.deviceId, "default", todayStr).catch(() => { });
                    regenerateSummary(device.deviceId, "ai-self", todayStr).catch(() => { });
                    // Weekly deep memory extraction (every Sunday)
                    if (tzNow().getDay() === 0) {
                        const weekAgo = fmt(dfAddDays(tzNow(), -7));
                        extractToMemory(device.deviceId, { start: weekAgo, end: todayStr }).catch(() => { });
                    }
                    break;
                }
            }
        }
    }
    // ── Fallback timer (when Redis unavailable) ──
    startFallbackTimer() {
        if (this.fallbackTimer)
            return;
        this.fallbackTimer = setInterval(() => {
            this.checkAll().catch((err) => {
                console.error("[proactive] Fallback check error:", err.message);
            });
        }, this.intervalMs);
        console.log(`[proactive] Fallback timer started (interval: ${this.intervalMs / 1000}s)`);
        // Cognitive digest fallback: every 3 hours
        this.digestTimer = setInterval(() => {
            this.runBatchDigest().catch((err) => {
                console.error("[proactive] Batch digest error:", err.message);
            });
        }, 3 * 60 * 60 * 1000);
        console.log("[proactive] Cognitive digest fallback timer started (interval: 3h)");
        // Cognitive daily cycle fallback: every 24 hours
        this.cognitiveDailyTimer = setInterval(() => {
            this.runCognitiveDaily().catch((err) => {
                console.error("[proactive] Cognitive daily cycle error:", err.message);
            });
        }, 24 * 60 * 60 * 1000);
        console.log("[proactive] Cognitive daily cycle fallback timer started (interval: 24h)");
        // Weekly emergence fallback: every 7 days
        this.emergenceWeeklyTimer = setInterval(() => {
            this.runWeeklyEmergence().catch((err) => {
                console.error("[proactive] Weekly emergence error:", err.message);
            });
        }, 7 * 24 * 60 * 60 * 1000);
        console.log("[proactive] Weekly emergence fallback timer started (interval: 7d)");
    }
    // ── Core check logic (shared by BullMQ and fallback) ──
    async checkAll() {
        const now = Date.now();
        for (const [deviceId, device] of this.devices) {
            if (device.ws.readyState !== WebSocket.OPEN) {
                this.devices.delete(deviceId);
                continue;
            }
            if (now - device.lastNudge < this.intervalMs * 0.8) {
                continue;
            }
            try {
                await this.checkDevice(device);
            }
            catch (err) {
                console.warn(`[proactive] Check failed for ${deviceId}: ${err.message}`);
            }
        }
    }
    /**
     * Batch-digest unprocessed records for all users with pending content.
     */
    async runBatchDigest() {
        try {
            // Find all users with undigested records by querying connected devices
            const userIds = new Set();
            for (const device of this.devices.values()) {
                if (device.userId)
                    userIds.add(device.userId);
            }
            // Also check DB for any user with undigested records
            const { query } = await import("../db/pool.js");
            const rows = await query(`SELECT DISTINCT user_id FROM record WHERE digested = FALSE AND status = 'completed' AND user_id IS NOT NULL`, []);
            for (const row of rows) {
                userIds.add(row.user_id);
            }
            if (userIds.size === 0) {
                console.log("[proactive:digest] No users with undigested records");
                return;
            }
            console.log(`[proactive:digest] Processing ${userIds.size} users with undigested records`);
            for (const userId of userIds) {
                let recordIds = [];
                try {
                    const records = await recordRepo.findUndigested(userId);
                    if (records.length === 0)
                        continue;
                    recordIds = records.map((r) => r.id);
                    console.log(`[proactive:digest] User ${userId}: ${recordIds.length} undigested records`);
                    // Find deviceId from connected devices or use userId as fallback
                    let deviceId = userId;
                    for (const device of this.devices.values()) {
                        if (device.userId === userId) {
                            deviceId = device.deviceId;
                            break;
                        }
                    }
                    await digestRecords(recordIds, { deviceId, userId });
                }
                catch (err) {
                    console.error(`[proactive:digest] Failed for user ${userId}:`, err.message);
                    // 失败时增加重试计数
                    for (const id of recordIds) {
                        try {
                            await recordRepo.incrementDigestAttempts(id);
                        }
                        catch {
                            // 忽略
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error("[proactive:digest] Batch digest failed:", err.message);
        }
    }
    /**
     * Run daily cognitive cycle for all users with active Strikes.
     */
    async runCognitiveDaily() {
        try {
            const { query } = await import("../db/pool.js");
            const rows = await query(`SELECT DISTINCT user_id FROM strike WHERE status = 'active'`, []);
            if (rows.length === 0) {
                console.log("[proactive:cognitive-daily] No users with active strikes");
                return;
            }
            console.log(`[proactive:cognitive-daily] Processing ${rows.length} user(s)`);
            for (const row of rows) {
                try {
                    await runDailyCognitiveCycle(row.user_id);
                }
                catch (err) {
                    console.error(`[proactive:cognitive-daily] Failed for user ${row.user_id}:`, err.message);
                }
            }
        }
        catch (err) {
            console.error("[proactive:cognitive-daily] Failed:", err.message);
        }
    }
    /**
     * Run weekly emergence engine for all users with active clusters.
     */
    async runWeeklyEmergence() {
        try {
            const { query } = await import("../db/pool.js");
            const rows = await query(`SELECT DISTINCT user_id FROM strike WHERE is_cluster = true AND status = 'active'`, []);
            if (rows.length === 0) {
                console.log("[proactive:emergence] No users with active clusters");
                return;
            }
            console.log(`[proactive:emergence] Processing ${rows.length} user(s)`);
            const { runEmergence } = await import("../cognitive/emergence.js");
            for (const row of rows) {
                try {
                    const result = await runEmergence(row.user_id);
                    console.log(`[proactive:emergence] User ${row.user_id}: ${result.higherOrderClusters} L2 created`);
                }
                catch (err) {
                    console.error(`[proactive:emergence] Failed for user ${row.user_id}:`, err.message);
                }
            }
        }
        catch (err) {
            console.error("[proactive:emergence] Failed:", err.message);
        }
    }
    async checkDevice(device) {
        const now = tzNow();
        const hour = now.getHours();
        const today = fmt(now);
        const nudgeKey = `${device.deviceId}:${today}`;
        // Time-aware pushes (only used in fallback mode — BullMQ uses cron)
        if (!this.redisAvailable) {
            if (hour >= 7 && hour < 8) {
                const briefingKey = `morning:${nudgeKey}`;
                if (!this.dailyPushSent.has(briefingKey)) {
                    try {
                        const cached = await dailyBriefingRepo.findByDeviceAndDate(device.deviceId, today, "morning");
                        if (!cached) {
                            const briefingText = "新的一天开始了，查看今日简报";
                            this.sendMessage(device, {
                                type: "proactive.morning_briefing",
                                payload: { text: briefingText },
                            });
                            this.persistNotification(device, "proactive.morning_briefing", "晨间简报", briefingText);
                            this.dailyPushSent.add(briefingKey);
                            device.lastNudge = Date.now();
                            return;
                        }
                    }
                    catch { /* table may not exist */ }
                }
            }
            if (hour >= 14 && hour < 15) {
                const relayKey = `relay:${nudgeKey}`;
                if (!this.dailyPushSent.has(relayKey)) {
                    try {
                        const relays = device.userId
                            ? await todoRepo.findRelayByUser(device.userId)
                            : await todoRepo.findRelayByDevice(device.deviceId);
                        if (relays.length > 0) {
                            const relayText = `你有 ${relays.length} 条信息还需要转达`;
                            this.sendMessage(device, {
                                type: "proactive.relay_reminder",
                                payload: { text: relayText, count: relays.length },
                            });
                            this.persistNotification(device, "proactive.relay_reminder", "转达提醒", relayText);
                            this.dailyPushSent.add(relayKey);
                            device.lastNudge = Date.now();
                            return;
                        }
                    }
                    catch { /* table may not exist */ }
                }
            }
            if (hour >= 20 && hour < 21) {
                const eveningKey = `evening:${nudgeKey}`;
                if (!this.dailyPushSent.has(eveningKey)) {
                    const eveningText = "今天辛苦了，看看日终总结";
                    this.sendMessage(device, {
                        type: "proactive.evening_summary",
                        payload: { text: eveningText },
                    });
                    this.persistNotification(device, "proactive.evening_summary", "日终总结", eveningText);
                    this.dailyPushSent.add(eveningKey);
                    device.lastNudge = Date.now();
                    return;
                }
            }
        }
        // ── Goal harvest follow-up: 完成 7+ 天未跟进的目标 (topic-lifecycle 场景 6) ──
        const harvestKey = `harvest:${nudgeKey}`;
        if (!this.dailyPushSent.has(harvestKey)) {
            try {
                const uid = device.userId ?? device.deviceId;
                const completedGoals = await import("../db/pool.js").then(({ query: q }) => q(`SELECT id, title FROM goal
             WHERE ${device.userId ? "user_id" : "device_id"} = $1
               AND status = 'completed'
               AND updated_at < NOW() - INTERVAL '7 days'
             ORDER BY updated_at ASC LIMIT 1`, [uid]));
                if (completedGoals.length > 0) {
                    const goal = completedGoals[0];
                    const text = `"${goal.title}" 完成一周了，结果怎样？`;
                    this.sendMessage(device, {
                        type: "proactive.message",
                        payload: { text, action: "chat" },
                    });
                    this.persistNotification(device, "proactive.goal_harvest", goal.title, text);
                    this.dailyPushSent.add(harvestKey);
                    device.lastNudge = Date.now();
                }
            }
            catch {
                // goal table may not exist yet
            }
        }
        // ── 提醒检查：reminder_at 在 30 分钟窗口内 ──
        try {
            const windowStart = tzNow().toISOString();
            const windowEnd = new Date(tzNow().getTime() + 30 * 60000).toISOString();
            const reminders = await todoRepo.findPendingReminders(windowStart, windowEnd);
            for (const todo of reminders) {
                // 只推送给相关设备
                const isOwner = (todo.user_id && todo.user_id === device.userId)
                    || (todo.device_id && todo.device_id === device.deviceId);
                if (!isOwner)
                    continue;
                this.sendMessage(device, {
                    type: "proactive.todo_reminder",
                    payload: {
                        todo_id: todo.id,
                        text: todo.text,
                        scheduled_start: todo.scheduled_start,
                        reminder_types: todo.reminder_types ?? ["notification"],
                    },
                });
                this.persistNotification(device, "proactive.todo_reminder", "待办提醒", todo.text);
                await todoRepo.markReminderSent(todo.id);
            }
        }
        catch (err) {
            // reminder 列可能还不存在（migration 未执行）
            if (!err.message?.includes("column") && !err.message?.includes("does not exist")) {
                console.warn(`[proactive] Reminder check failed: ${err.message}`);
            }
        }
        // Standard todo checks
        const pending = device.userId
            ? await todoRepo.findPendingByUser(device.userId)
            : await todoRepo.findPendingByDevice(device.deviceId);
        if (pending.length === 0)
            return;
        const unscheduled = pending.filter((t) => !t.scheduled_start);
        const overdue = pending.filter((t) => {
            const end = t.scheduled_end;
            if (!end)
                return false;
            const impact = t.impact ?? 5;
            return new Date(end).getTime() < Date.now() && impact >= 4;
        });
        overdue.sort((a, b) => (b.impact ?? 5) - (a.impact ?? 5));
        if (overdue.length > 0) {
            const todo = overdue[0];
            const isAiActionable = todo.ai_actionable === true;
            const suggestion = isAiActionable
                ? `"${todo.text}" 已超时，要不要让AI帮你处理？`
                : `"${todo.text}" 已超过预定时间，需要现在处理吗？`;
            this.sendNudge(device, {
                type: "proactive.todo_nudge",
                payload: { todoId: todo.id, text: todo.text, suggestion, ai_actionable: isAiActionable },
            });
            this.persistNotification(device, "proactive.todo_nudge", "待办提醒", suggestion);
            device.lastNudge = Date.now();
        }
        else if (unscheduled.length > 0) {
            const scheduleText = `你有 ${unscheduled.length} 项待办还没有安排时间，要现在安排吗？`;
            this.sendMessage(device, {
                type: "proactive.message",
                payload: { text: scheduleText, action: "schedule" },
            });
            this.persistNotification(device, "proactive.schedule_reminder", "排期提醒", scheduleText);
            device.lastNudge = Date.now();
        }
    }
    /** 持久化通知到数据库 */
    /**
     * 持久化通知 + 数据库去重（防重启/多进程重复发送）。
     * 返回 true 表示成功写入（新通知），false 表示今天已发过（跳过）。
     */
    async persistNotification(device, type, title, body) {
        try {
            // DB 去重：今天是否已发过同类通知
            const exists = await notificationRepo.hasTodayNotification(type, device.userId, device.deviceId);
            if (exists) {
                console.log(`[proactive] Notification ${type} already sent today for ${device.userId ?? device.deviceId}, skip`);
                return false;
            }
            await notificationRepo.create({
                deviceId: device.deviceId,
                userId: device.userId ?? null,
                type,
                title,
                body,
            });
            return true;
        }
        catch (err) {
            console.warn(`[proactive] Failed to persist notification: ${err.message}`);
            return false;
        }
    }
    sendNudge(device, msg) {
        if (device.ws.readyState === WebSocket.OPEN) {
            device.ws.send(JSON.stringify(msg));
        }
    }
    sendMessage(device, msg) {
        if (device.ws.readyState === WebSocket.OPEN) {
            device.ws.send(JSON.stringify(msg));
        }
    }
}
// Singleton
let _engine = null;
export function getProactiveEngine() {
    if (!_engine) {
        _engine = new ProactiveEngine();
    }
    return _engine;
}
//# sourceMappingURL=engine.js.map