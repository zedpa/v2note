/**
 * Proactive Push Engine — periodically checks connected devices' todo state
 * and sends reminders via WebSocket.
 */

import { WebSocket } from "ws";
import { todoRepo } from "../db/repositories/index.js";

interface ConnectedDevice {
  deviceId: string;
  ws: WebSocket;
  lastNudge: number; // timestamp of last nudge
}

export class ProactiveEngine {
  private devices = new Map<string, ConnectedDevice>();
  private timer: NodeJS.Timeout | null = null;
  private intervalMs = 30 * 60 * 1000; // default 30 minutes

  /**
   * Set the check interval in minutes.
   */
  setInterval(minutes: number): void {
    this.intervalMs = minutes * 60 * 1000;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  /**
   * Register a device connection for proactive monitoring.
   */
  registerDevice(deviceId: string, ws: WebSocket): void {
    this.devices.set(deviceId, {
      deviceId,
      ws,
      lastNudge: 0,
    });
    console.log(`[proactive] Device registered: ${deviceId} (total: ${this.devices.size})`);
  }

  /**
   * Unregister a device connection.
   */
  unregisterDevice(deviceId: string): void {
    this.devices.delete(deviceId);
    console.log(`[proactive] Device unregistered: ${deviceId} (total: ${this.devices.size})`);
  }

  /**
   * Unregister by WebSocket reference (for disconnect cleanup).
   */
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
   * Start the periodic check loop.
   */
  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.checkAll().catch((err) => {
        console.error("[proactive] Check error:", err.message);
      });
    }, this.intervalMs);

    console.log(`[proactive] Engine started (interval: ${this.intervalMs / 1000}s)`);
  }

  /**
   * Stop the periodic check loop.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[proactive] Engine stopped");
  }

  /**
   * Check all connected devices for pending todos and send nudges.
   */
  async checkAll(): Promise<void> {
    const now = Date.now();

    for (const [deviceId, device] of this.devices) {
      // Skip if ws is closed
      if (device.ws.readyState !== WebSocket.OPEN) {
        this.devices.delete(deviceId);
        continue;
      }

      // Skip if recently nudged
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

  /**
   * Check a single device for pending todos.
   */
  private async checkDevice(device: ConnectedDevice): Promise<void> {
    const pending = await todoRepo.findPendingByDevice(device.deviceId);

    if (pending.length === 0) return;

    // Find todos without scheduled time
    const unscheduled = pending.filter(
      (t) => !(t as any).scheduled_start,
    );

    // Find overdue todos (scheduled_end is in the past)
    const overdue = pending.filter((t) => {
      const end = (t as any).scheduled_end;
      if (!end) return false;
      return new Date(end).getTime() < Date.now();
    });

    // Send nudge for the most important item
    if (overdue.length > 0) {
      const todo = overdue[0];
      this.sendNudge(device, {
        type: "proactive.todo_nudge",
        payload: {
          todoId: todo.id,
          text: todo.text,
          suggestion: `"${todo.text}" 已超过预定时间，需要现在处理吗？`,
        },
      });
      device.lastNudge = Date.now();
    } else if (unscheduled.length > 0) {
      const count = unscheduled.length;
      this.sendMessage(device, {
        type: "proactive.message",
        payload: {
          text: `你有 ${count} 项待办还没有安排时间，要现在安排吗？`,
          action: "schedule",
        },
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
