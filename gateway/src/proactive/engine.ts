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
import { todoRepo } from "../db/repositories/index.js";
import * as dailyBriefingRepo from "../db/repositories/daily-briefing.js";

interface ConnectedDevice {
  deviceId: string;
  ws: WebSocket;
  lastNudge: number;
}

// BullMQ types (dynamically imported to avoid hard dependency on Redis)
type BullQueue = any;
type BullWorker = any;

export class ProactiveEngine {
  private devices = new Map<string, ConnectedDevice>();
  private intervalMs = 30 * 60 * 1000; // 30 minutes
  private dailyPushSent = new Set<string>();

  // Fallback timer (used when Redis unavailable)
  private fallbackTimer: NodeJS.Timeout | null = null;

  // BullMQ instances (populated if Redis is available)
  private queue: BullQueue | null = null;
  private worker: BullWorker | null = null;
  private redisAvailable = false;

  setInterval(minutes: number): void {
    this.intervalMs = minutes * 60 * 1000;
    if (this.fallbackTimer) {
      this.stop();
      this.start();
    }
  }

  registerDevice(deviceId: string, ws: WebSocket): void {
    this.devices.set(deviceId, { deviceId, ws, lastNudge: 0 });
    console.log(`[proactive] Device registered: ${deviceId} (total: ${this.devices.size})`);

    // Register per-device BullMQ schedulers if Redis is available
    if (this.redisAvailable && this.queue) {
      this.registerDeviceSchedulers(deviceId).catch((err) => {
        console.warn(`[proactive] Failed to register device schedulers: ${err.message}`);
      });
    }
  }

  unregisterDevice(deviceId: string): void {
    this.devices.delete(deviceId);
    console.log(`[proactive] Device unregistered: ${deviceId} (total: ${this.devices.size})`);
  }

  unregisterByWs(ws: WebSocket): void {
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
  async start(): Promise<void> {
    try {
      await this.tryStartBullMQ();
    } catch (err: any) {
      console.warn(`[proactive] BullMQ unavailable (${err.message}), using fallback timer`);
      this.startFallbackTimer();
    }
  }

  stop(): void {
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.worker) {
      this.worker.close().catch(() => {});
      this.worker = null;
    }
    if (this.queue) {
      this.queue.close().catch(() => {});
      this.queue = null;
    }
    this.redisAvailable = false;
    console.log("[proactive] Engine stopped");
  }

  // ── BullMQ setup ──

  private async tryStartBullMQ(): Promise<void> {
    // Dynamic import to avoid hard dependency
    const { Queue, Worker } = await import("bullmq");
    const redisHost = process.env.REDIS_HOST || "localhost";
    const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
    const redisPassword = process.env.REDIS_PASSWORD;

    // Use plain connection config (avoids ioredis version mismatch with bullmq's internal copy)
    const connectionConfig = { host: redisHost, port: redisPort, password: redisPassword };

    // Test Redis connectivity with a raw TCP check (fast-fail, 3s timeout)
    const net = await import("node:net");
    await new Promise<void>((resolve, reject) => {
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

    this.worker = new Worker(
      "proactive-engine",
      async (job: any) => {
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
        }
      },
      { connection: connectionConfig, concurrency: 5 },
    );

    this.worker.on("failed", (job: any, err: Error) => {
      console.error(`[proactive:bullmq] ${job?.name} failed:`, err.message);
    });

    this.worker.on("error", (err: Error) => {
      console.error(`[proactive:bullmq] Worker error:`, err.message);
    });

    // Setup repeatable schedulers (idempotent)
    await this.queue.upsertJobScheduler(
      "check-all-scheduler",
      { every: this.intervalMs },
      { name: "check-all-devices", data: {} },
    );

    this.redisAvailable = true;
    console.log(`[proactive] Engine started with BullMQ (Redis: ${redisHost}:${redisPort})`);
  }

  private async registerDeviceSchedulers(deviceId: string): Promise<void> {
    if (!this.queue) return;

    await this.queue.upsertJobScheduler(
      `morning-${deviceId}`,
      { pattern: "30 7 * * *" },
      { name: "morning-briefing", data: { deviceId } },
    );
    await this.queue.upsertJobScheduler(
      `relay-${deviceId}`,
      { pattern: "0 14 * * *" },
      { name: "relay-reminder", data: { deviceId } },
    );
    await this.queue.upsertJobScheduler(
      `evening-${deviceId}`,
      { pattern: "0 20 * * *" },
      { name: "evening-summary", data: { deviceId } },
    );
  }

  private async handleTimedPush(deviceId: string | undefined, type: "morning" | "relay" | "evening"): Promise<void> {
    // BullMQ scheduled job: push to all connected devices or specific device
    const targets = deviceId
      ? [this.devices.get(deviceId)].filter(Boolean) as ConnectedDevice[]
      : Array.from(this.devices.values());

    for (const device of targets) {
      if (device.ws.readyState !== WebSocket.OPEN) continue;

      switch (type) {
        case "morning":
          this.sendMessage(device, {
            type: "proactive.morning_briefing",
            payload: { text: "新的一天开始了，查看今日简报" },
          });
          break;
        case "relay": {
          try {
            const relays = await todoRepo.findRelayByDevice(device.deviceId);
            if (relays.length > 0) {
              this.sendMessage(device, {
                type: "proactive.relay_reminder",
                payload: { text: `你有 ${relays.length} 条信息还需要转达`, count: relays.length },
              });
            }
          } catch { /* table may not exist */ }
          break;
        }
        case "evening":
          this.sendMessage(device, {
            type: "proactive.evening_summary",
            payload: { text: "今天辛苦了，看看日终总结" },
          });
          break;
      }
    }
  }

  // ── Fallback timer (when Redis unavailable) ──

  private startFallbackTimer(): void {
    if (this.fallbackTimer) return;
    this.fallbackTimer = setInterval(() => {
      this.checkAll().catch((err) => {
        console.error("[proactive] Fallback check error:", err.message);
      });
    }, this.intervalMs);
    console.log(`[proactive] Fallback timer started (interval: ${this.intervalMs / 1000}s)`);
  }

  // ── Core check logic (shared by BullMQ and fallback) ──

  async checkAll(): Promise<void> {
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
      } catch (err: any) {
        console.warn(`[proactive] Check failed for ${deviceId}: ${err.message}`);
      }
    }
  }

  private async checkDevice(device: ConnectedDevice): Promise<void> {
    const now = new Date();
    const hour = now.getHours();
    const today = now.toISOString().split("T")[0];
    const nudgeKey = `${device.deviceId}:${today}`;

    // Time-aware pushes (only used in fallback mode — BullMQ uses cron)
    if (!this.redisAvailable) {
      if (hour >= 7 && hour < 9) {
        const briefingKey = `morning:${nudgeKey}`;
        if (!this.dailyPushSent.has(briefingKey)) {
          try {
            const cached = await dailyBriefingRepo.findByDeviceAndDate(device.deviceId, today, "morning");
            if (!cached) {
              this.sendMessage(device, {
                type: "proactive.morning_briefing",
                payload: { text: "新的一天开始了，查看今日简报" },
              });
              this.dailyPushSent.add(briefingKey);
              device.lastNudge = Date.now();
              return;
            }
          } catch { /* table may not exist */ }
        }
      }

      if (hour >= 14 && hour < 17) {
        const relayKey = `relay:${nudgeKey}`;
        if (!this.dailyPushSent.has(relayKey)) {
          try {
            const relays = await todoRepo.findRelayByDevice(device.deviceId);
            if (relays.length > 0) {
              this.sendMessage(device, {
                type: "proactive.relay_reminder",
                payload: { text: `你有 ${relays.length} 条信息还需要转达`, count: relays.length },
              });
              this.dailyPushSent.add(relayKey);
              device.lastNudge = Date.now();
              return;
            }
          } catch { /* table may not exist */ }
        }
      }

      if (hour >= 20 && hour < 22) {
        const eveningKey = `evening:${nudgeKey}`;
        if (!this.dailyPushSent.has(eveningKey)) {
          this.sendMessage(device, {
            type: "proactive.evening_summary",
            payload: { text: "今天辛苦了，看看日终总结" },
          });
          this.dailyPushSent.add(eveningKey);
          device.lastNudge = Date.now();
          return;
        }
      }
    }

    // Standard todo checks
    const pending = await todoRepo.findPendingByDevice(device.deviceId);
    if (pending.length === 0) return;

    const unscheduled = pending.filter((t) => !(t as any).scheduled_start);
    const overdue = pending.filter((t) => {
      const end = (t as any).scheduled_end;
      if (!end) return false;
      const impact = (t as any).impact ?? 5;
      return new Date(end).getTime() < Date.now() && impact >= 4;
    });

    overdue.sort((a, b) => ((b as any).impact ?? 5) - ((a as any).impact ?? 5));

    if (overdue.length > 0) {
      const todo = overdue[0];
      const isAiActionable = (todo as any).ai_actionable === true;
      const suggestion = isAiActionable
        ? `"${todo.text}" 已超时，要不要让AI帮你处理？`
        : `"${todo.text}" 已超过预定时间，需要现在处理吗？`;
      this.sendNudge(device, {
        type: "proactive.todo_nudge",
        payload: { todoId: todo.id, text: todo.text, suggestion, ai_actionable: isAiActionable },
      });
      device.lastNudge = Date.now();
    } else if (unscheduled.length > 0) {
      this.sendMessage(device, {
        type: "proactive.message",
        payload: { text: `你有 ${unscheduled.length} 项待办还没有安排时间，要现在安排吗？`, action: "schedule" },
      });
      device.lastNudge = Date.now();
    }
  }

  private sendNudge(device: ConnectedDevice, msg: any): void {
    if (device.ws.readyState === WebSocket.OPEN) {
      device.ws.send(JSON.stringify(msg));
    }
  }

  private sendMessage(device: ConnectedDevice, msg: any): void {
    if (device.ws.readyState === WebSocket.OPEN) {
      device.ws.send(JSON.stringify(msg));
    }
  }
}

// Singleton
let _engine: ProactiveEngine | null = null;

export function getProactiveEngine(): ProactiveEngine {
  if (!_engine) {
    _engine = new ProactiveEngine();
  }
  return _engine;
}
