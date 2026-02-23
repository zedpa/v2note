/**
 * Proactive Push Engine — periodically checks connected devices' todo state
 * and sends reminders via WebSocket.
 */
import { WebSocket } from "ws";
export declare class ProactiveEngine {
    private devices;
    private timer;
    private intervalMs;
    /**
     * Set the check interval in minutes.
     */
    setInterval(minutes: number): void;
    /**
     * Register a device connection for proactive monitoring.
     */
    registerDevice(deviceId: string, ws: WebSocket): void;
    /**
     * Unregister a device connection.
     */
    unregisterDevice(deviceId: string): void;
    /**
     * Unregister by WebSocket reference (for disconnect cleanup).
     */
    unregisterByWs(ws: WebSocket): void;
    /**
     * Start the periodic check loop.
     */
    start(): void;
    /**
     * Stop the periodic check loop.
     */
    stop(): void;
    /**
     * Check all connected devices for pending todos and send nudges.
     */
    checkAll(): Promise<void>;
    /**
     * Check a single device for pending todos.
     */
    private checkDevice;
    private sendNudge;
    private sendMessage;
}
export declare function getProactiveEngine(): ProactiveEngine;
