/**
 * FAB 胶囊通知 — 全局轻量事件 store
 *
 * 所有状态通知统一通过 FAB 位置的胶囊展示，替代 Sonner toast。
 * 胶囊显示后自动消失，FAB 恢复原样。
 */

export type NotifyLevel = "success" | "error" | "info";

export interface FabNotification {
  text: string;
  level: NotifyLevel;
  /** 自动消失时间(ms)，默认 2000 */
  duration?: number;
}

type Listener = (n: FabNotification) => void;

const listeners = new Set<Listener>();

/** 发送通知 — FAB 胶囊会展示此消息 */
export function fabNotify(text: string, level: NotifyLevel = "info", duration?: number) {
  const n: FabNotification = { text, level, duration };
  for (const cb of listeners) cb(n);
}

/** 快捷方法 */
fabNotify.success = (text: string, duration?: number) => fabNotify(text, "success", duration);
fabNotify.error = (text: string, duration?: number) => fabNotify(text, "error", duration);
fabNotify.info = (text: string, duration?: number) => fabNotify(text, "info", duration);

/** 订阅通知（FAB 内部使用） */
export function onFabNotify(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
