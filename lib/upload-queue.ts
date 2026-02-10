import { getItem, setItem, removeItem } from "./storage";
import { uploadAudio } from "./upload";
import { processRecording } from "./process";
import { emit } from "./events";

const QUEUE_KEY = "upload:failedQueue";

export interface QueuedUpload {
  id: string;
  base64: string;
  mimeType: string;
  durationSeconds: number;
  locationText?: string;
  addedAt: string;
  lastError?: string;
}

async function readQueue(): Promise<QueuedUpload[]> {
  const value = await getItem(QUEUE_KEY);
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedUpload[]): Promise<void> {
  await setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueFailedUpload(
  base64: string,
  mimeType: string,
  durationSeconds: number,
  locationText?: string,
): Promise<void> {
  const queue = await readQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    base64,
    mimeType,
    durationSeconds,
    locationText,
    addedAt: new Date().toISOString(),
  });
  await writeQueue(queue);
}

export async function getFailedUploads(): Promise<QueuedUpload[]> {
  return readQueue();
}

export async function retryUpload(id: string): Promise<boolean> {
  const queue = await readQueue();
  const item = queue.find((q) => q.id === id);
  if (!item) return false;

  try {
    const uploaded = await uploadAudio(
      item.base64,
      item.mimeType,
      item.durationSeconds,
      item.locationText,
    );
    emit("recording:uploaded");

    // Process in background
    processRecording(uploaded.recordId, uploaded.audioUrl)
      .then(() => emit("recording:processed"))
      .catch(() => emit("recording:processed"));

    // Remove from queue on success
    await writeQueue(queue.filter((q) => q.id !== id));
    return true;
  } catch (err: any) {
    // Update error message
    const updated = queue.map((q) =>
      q.id === id ? { ...q, lastError: err.message } : q,
    );
    await writeQueue(updated);
    return false;
  }
}

export async function retryAll(): Promise<{ success: number; failed: number }> {
  const queue = await readQueue();
  let success = 0;
  let failed = 0;

  for (const item of queue) {
    const ok = await retryUpload(item.id);
    if (ok) success++;
    else failed++;
  }

  return { success, failed };
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((q) => q.id !== id));
}

export async function clearQueue(): Promise<void> {
  await removeItem(QUEUE_KEY);
}
