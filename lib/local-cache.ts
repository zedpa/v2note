import { getItem, setItem, removeItem } from "./storage";
import type { NoteItem } from "./types";

const CACHE_KEY = "cache:notes";
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

interface CachedNotes {
  notes: NoteItem[];
  timestamp: number;
}

export async function getCachedNotes(): Promise<NoteItem[] | null> {
  try {
    const value = await getItem(CACHE_KEY);
    if (!value) return null;

    const cached: CachedNotes = JSON.parse(value);
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL) return null;

    return cached.notes;
  } catch {
    return null;
  }
}

export async function setCachedNotes(notes: NoteItem[]): Promise<void> {
  try {
    const data: CachedNotes = { notes, timestamp: Date.now() };
    await setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Silently fail — cache is non-critical
  }
}

export async function clearNotesCache(): Promise<void> {
  await removeItem(CACHE_KEY);
}
