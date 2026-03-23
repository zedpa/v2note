type EventCallback = () => void;

const listeners: Map<string, Set<EventCallback>> = new Map();

// Track recent events so late-mounting listeners can catch up
const recentEvents: Map<string, number> = new Map();
const STICKY_WINDOW_MS = 3000;

export function emit(event: string) {
  recentEvents.set(event, Date.now());
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

  // If the event fired recently (within sticky window), call immediately
  const lastFired = recentEvents.get(event);
  if (lastFired && Date.now() - lastFired < STICKY_WINDOW_MS) {
    recentEvents.delete(event);
    callback();
  }

  return () => {
    listeners.get(event)?.delete(callback);
  };
}
