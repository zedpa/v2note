type EventCallback = () => void;

const listeners: Map<string, Set<EventCallback>> = new Map();

export function emit(event: string) {
  const cbs = listeners.get(event);
  if (cbs) {
    for (const cb of cbs) cb();
  }
}

export function on(event: string, callback: EventCallback): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(callback);

  return () => {
    listeners.get(event)?.delete(callback);
  };
}
