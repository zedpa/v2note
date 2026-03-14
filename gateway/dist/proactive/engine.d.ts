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
export declare class ProactiveEngine {
    private devices;
    private intervalMs;
    private dailyPushSent;
    private fallbackTimer;
    private queue;
    private worker;
    private redisAvailable;
    setInterval(minutes: number): void;
    registerDevice(deviceId: string, ws: WebSocket, userId?: string): void;
    setDeviceUserId(deviceId: string, userId: string): void;
    unregisterDevice(deviceId: string): void;
    unregisterByWs(ws: WebSocket): void;
    /**
     * Start the engine. Tries BullMQ first, falls back to setInterval.
     */
    start(): Promise<void>;
    stop(): void;
    private tryStartBullMQ;
    private registerDeviceSchedulers;
    private handleTimedPush;
    private startFallbackTimer;
    checkAll(): Promise<void>;
    private checkDevice;
    private sendNudge;
    private sendMessage;
}
export declare function getProactiveEngine(): ProactiveEngine;
