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
    private digestTimer;
    private cognitiveDailyTimer;
    private emergenceWeeklyTimer;
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
    /**
     * Batch-digest unprocessed records for all users with pending content.
     */
    private runBatchDigest;
    /**
     * Run daily cognitive cycle for all users with active Strikes.
     */
    private runCognitiveDaily;
    /**
     * Run weekly emergence engine for all users with active clusters.
     */
    private runWeeklyEmergence;
    private checkDevice;
    /** 持久化通知到数据库 */
    /**
     * 持久化通知 + 数据库去重（防重启/多进程重复发送）。
     * 返回 true 表示成功写入（新通知），false 表示今天已发过（跳过）。
     */
    private persistNotification;
    private sendNudge;
    private sendMessage;
}
export declare function getProactiveEngine(): ProactiveEngine;
