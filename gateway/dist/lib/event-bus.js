/**
 * 轻量级进程内事件总线 — 用于跨模块异步通知
 * 例如 digest 创建 todo 后通知 WS 层发送消息给客户端
 */
import { EventEmitter } from "node:events";
const bus = new EventEmitter();
bus.setMaxListeners(50);
export const eventBus = bus;
//# sourceMappingURL=event-bus.js.map