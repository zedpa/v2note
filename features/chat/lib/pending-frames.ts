/**
 * Pending Control Frames — gateway-client 待发队列（Phase 9 §7.1）
 *
 * regression: fix-cold-resume-silent-loss §7.1
 *
 * 背景：冷启动时 WS 未 OPEN 且 / 或 access token 为 null，此前 gateway-client.send()
 * 直接静默 drop，导致 asr.start / asr.stop / chat.user 等**控制消息**丢失，录音与聊天
 * 的首操作经常失败。
 *
 * 本模块把"待发帧"抽象成一个内存队列（纯函数 + 类），让 gateway-client 专注连接管理、
 * 队列语义集中在这里便于单测。
 *
 * 关键规则（严格按 spec §7.1）：
 *   - **必保留**（unboundedKeep）：`chat.message` / `chat.user` / `asr.start` / `asr.stop`
 *   - **可丢弃**（bestEffort，FIFO 上限 50）：
 *       `asr.cancel` / `asr.partial-hint` / `heartbeat` / `read-receipt`
 *   - 同 asr sessionId 组"同生同灭"：
 *       - 同 sessionId 出现 `asr.cancel` → 同 sessionId 的所有 bestEffort 帧立即清空
 *       - `asr.start` 从必保留队列被强制移除 → 同 sessionId 后续 asr.stop/cancel 全部作废
 *       - flush 过程中 asr.start 发送失败 → 同 sessionId 后续帧全部回滚到队首
 *   - flush：
 *       - 带 client_id 消息需 server ack；10s 未返回 → 保留在队首，awaitingAck=true
 *       - 不带 client_id 消息 → `ws.send` 无抛错即视为成功，直接出队
 *       - flush 中途 WS 非 OPEN 或收到 401 → 立即中止，**禁止继续调用 ws.send**
 *   - 二进制帧（PCM）不走此队列（音频真相在 audio_blobs）
 *   - 不跨页面刷新持久化（真相源是 captureStore / audio_blobs）
 */

/** 控制消息的 type 白名单 */
export type ControlFrameType =
  | "chat.message"
  | "chat.user"
  | "asr.start"
  | "asr.stop"
  | "asr.cancel"
  | "asr.partial-hint"
  | "heartbeat"
  | "read-receipt";

/** 必保留 vs 可丢弃 */
const UNBOUNDED_KEEP: ReadonlySet<ControlFrameType> = new Set([
  "chat.message",
  "chat.user",
  "asr.start",
  "asr.stop",
]);

const BEST_EFFORT: ReadonlySet<ControlFrameType> = new Set([
  "asr.cancel",
  "asr.partial-hint",
  "heartbeat",
  "read-receipt",
]);

/** bestEffort FIFO 上限 */
export const BEST_EFFORT_CAPACITY = 50;

/**
 * 一个待发控制帧的元信息。raw 是要实际 JSON.stringify 出去的 payload，
 * 其余字段是队列自身要维护的状态。
 */
export interface PendingFrame {
  /** 原始消息（会被 ws.send(JSON.stringify(raw)) 发出） */
  raw: { type: ControlFrameType; payload: Record<string, unknown> };
  /** 帧类型（冗余保存以避免每次读 raw.type） */
  type: ControlFrameType;
  /** 是否必保留（优先级）— 按 type 判定 */
  priority: "keep" | "best_effort";
  /** 绑定的 asr session（用于"同生同灭" + flush 失败回滚） */
  sessionId?: string | null;
  /** 幂等 key（来自 payload.client_id）— 仅 chat.user/message/asr.start 可能有 */
  clientId?: string | null;
  /** flush 过程中：已 send 但未 ack */
  awaitingAck?: boolean;
}

/** 判断一个 type 是否属于可丢弃（bestEffort）类别 */
export function isBestEffort(type: ControlFrameType): boolean {
  return BEST_EFFORT.has(type);
}

/** 判断一个 type 是否属于必保留（unboundedKeep）类别 */
export function isUnboundedKeep(type: ControlFrameType): boolean {
  return UNBOUNDED_KEEP.has(type);
}

/**
 * 从 raw payload 中读出 sessionId（仅 asr.* 帧有）。
 * 对象约定是 payload.sessionId（与 GatewayClient 当前契约一致）。
 */
function readSessionId(
  raw: PendingFrame["raw"],
): string | null {
  const s = (raw.payload as { sessionId?: unknown }).sessionId;
  if (typeof s === "string" && s.length > 0) return s;
  return null;
}

/** 从 raw payload 中读出 client_id（仅 chat.user/message/asr.start 可能有） */
function readClientId(raw: PendingFrame["raw"]): string | null {
  const c = (raw.payload as { client_id?: unknown }).client_id;
  if (typeof c === "string" && c.length > 0) return c;
  return null;
}

/**
 * 队列。所有操作都是同步的；flush 的异步 I/O 交由 gateway-client 负责。
 */
export class PendingControlFramesQueue {
  private frames: PendingFrame[] = [];
  /** 被强制作废的 sessionId（asr.start 已出队但整组被取消） */
  private voidedSessions: Set<string> = new Set();

  /**
   * 入队。返回 true 表示实际入队，false 表示被策略丢弃（bestEffort 溢出 or 未知类型）。
   * 同 sessionId 的 asr.cancel 会在入队**前**清空同组 bestEffort 帧（spec 规定）。
   */
  enqueue(raw: PendingFrame["raw"]): boolean {
    const type = raw.type;
    if (!isUnboundedKeep(type) && !isBestEffort(type)) {
      // 未知类型：本模块不负责（gateway-client 可直接 ws.send 或 drop）
      return false;
    }

    const sessionId = readSessionId(raw);
    const clientId = readClientId(raw);

    // 同生同灭 A：asr.cancel 入队时，立即清空同 sessionId 的 bestEffort 帧
    // （asr.cancel 自己仍保留入队——它对 gateway 表达"取消"意图）
    if (type === "asr.cancel" && sessionId) {
      this.frames = this.frames.filter(
        (f) =>
          !(f.priority === "best_effort" && f.sessionId === sessionId),
      );
    }

    // 同生同灭 B：若该 sessionId 已被标记 voided → 同 sessionId 的 asr.stop/cancel 作废
    if (sessionId && this.voidedSessions.has(sessionId)) {
      if (type === "asr.stop" || type === "asr.cancel") {
        return false;
      }
    }

    const frame: PendingFrame = {
      raw,
      type,
      priority: isUnboundedKeep(type) ? "keep" : "best_effort",
      sessionId,
      clientId,
    };

    // bestEffort 溢出 FIFO：先丢最早的同类帧
    if (frame.priority === "best_effort") {
      const bestEffortCount = this.frames.filter(
        (f) => f.priority === "best_effort",
      ).length;
      if (bestEffortCount >= BEST_EFFORT_CAPACITY) {
        const firstIdx = this.frames.findIndex(
          (f) => f.priority === "best_effort",
        );
        if (firstIdx !== -1) this.frames.splice(firstIdx, 1);
      }
    }

    this.frames.push(frame);
    return true;
  }

  /**
   * 标记某 sessionId 组作废（asr.start 被强制移除时调用）。
   * 当前队列中该 sessionId 下的 asr.stop/cancel 立即清除；
   * 后续 enqueue 同 sessionId 的 asr.stop/cancel 也会被拒绝。
   */
  voidSession(sessionId: string): void {
    if (!sessionId) return;
    this.voidedSessions.add(sessionId);
    this.frames = this.frames.filter((f) => {
      if (f.sessionId !== sessionId) return true;
      // 同 sessionId 下，除了 asr.start 本身（被外部移除了），保留其他帧为作废剥离
      if (f.type === "asr.stop" || f.type === "asr.cancel") return false;
      return true;
    });
  }

  /** 当前队列快照（只读拷贝，测试用） */
  snapshot(): readonly PendingFrame[] {
    return [...this.frames];
  }

  /** 长度（调试 / 状态条） */
  size(): number {
    return this.frames.length;
  }

  /** 清空全部（调试 / disconnect 兜底；生产路径谨慎使用） */
  clear(): void {
    this.frames = [];
    this.voidedSessions.clear();
  }

  /**
   * 头部取一帧（不出队，便于 flush 循环中 peek → send → ack → dequeue）。
   */
  peek(): PendingFrame | null {
    return this.frames[0] ?? null;
  }

  /**
   * 明确出队某条帧（通常是 peek() 确认 ack 后调用）。
   * 通过引用相等匹配；若已被其他路径移除则 no-op。
   */
  dequeue(frame: PendingFrame): void {
    const idx = this.frames.indexOf(frame);
    if (idx !== -1) this.frames.splice(idx, 1);
  }

  /**
   * flush 过程中：某帧发送失败（WS 异常 / 401 等），需要回滚。
   *
   * 若失败的是 asr.start：同 sessionId 后续帧全部保留在队列（本就在队列里），
   * 但将 start 标记 awaitingAck=false 以便下次 flush 重试（由 gateway client_id
   * 幂等兜底，不会重复生成）。本方法只负责"保留"——因为帧从未离开过队列。
   */
  markAwaitingAck(frame: PendingFrame, awaiting: boolean): void {
    const idx = this.frames.indexOf(frame);
    if (idx !== -1) this.frames[idx] = { ...frame, awaitingAck: awaiting };
  }
}
