import { Preferences } from "@capacitor/preferences";
import type { NoteItem } from "./types";

const CACHE_KEY = "cache:notes";
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

interface CachedNotes {
  notes: NoteItem[];
  timestamp: number;
}

export async function getCachedNotes(): Promise<NoteItem[] | null> {
  try {
    const { value } = await Preferences.get({ key: CACHE_KEY });
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
    await Preferences.set({ key: CACHE_KEY, value: JSON.stringify(data) });
  } catch {
    // Silently fail — cache is non-critical
  }
}

export async function clearNotesCache(): Promise<void> {
  await Preferences.remove({ key: CACHE_KEY });
}
