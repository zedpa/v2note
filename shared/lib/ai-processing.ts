/**
 * 全局 AI 后台处理状态 store。
 *
 * 追踪完整 AI 管道生命周期（process → digest → todo 投影）。
 * - 引用计数：多个并发管道互不干扰
 * - 8s 衰减：管道无后续事件时自动结束（纯记录型不产生 todo）
 * - renew 续期：中间事件重置衰减计时器
 * - 30s 绝对超时：兜底防卡死
 */

type Listener = (processing: boolean) => void;

const listeners = new Set<Listener>();
let _count = 0;
let _absoluteTimer: ReturnType<typeof setTimeout> | null = null;
const _decayTimers = new Map<string, ReturnType<typeof setTimeout>>();

const DECAY_MS = 8_000;
const ABSOLUTE_MS = 30_000;

function notify() {
  const processing = _count > 0;
  for (const cb of listeners) cb(processing);
}

let _seq = 0;
function nextId(): string {
  return `p${++_seq}`;
}

/** 开始一个 AI 处理管道，返回 pipelineId */
export function startAiPipeline(): string {
  const id = nextId();
  _count++;
  notify();

  // 衰减计时器
  _decayTimers.set(id, setTimeout(() => endAiPipeline(id), DECAY_MS));

  // 绝对超时（仅首次启动）
  if (!_absoluteTimer) {
    _absoluteTimer = setTimeout(() => {
      _count = 0;
      _decayTimers.forEach((t) => clearTimeout(t));
      _decayTimers.clear();
      _absoluteTimer = null;
      notify();
    }, ABSOLUTE_MS);
  }

  return id;
}

/** 续期管道（收到中间事件如 process.result 时调用） */
export function renewAiPipeline(id: string) {
  const existing = _decayTimers.get(id);
  if (!existing) return;
  clearTimeout(existing);
  _decayTimers.set(id, setTimeout(() => endAiPipeline(id), DECAY_MS));
}

/** 结束管道（收到终态事件如 todo.created / error 时调用） */
export function endAiPipeline(id: string) {
  if (!_decayTimers.has(id)) return; // 已结束
  clearTimeout(_decayTimers.get(id)!);
  _decayTimers.delete(id);
  _count = Math.max(0, _count - 1);
  if (_count === 0 && _absoluteTimer) {
    clearTimeout(_absoluteTimer);
    _absoluteTimer = null;
  }
  notify();
}

export function isAiProcessing(): boolean {
  return _count > 0;
}

export function onAiProcessingChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
