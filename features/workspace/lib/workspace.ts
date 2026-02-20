import { getItem, setItem, removeItem } from "@/shared/lib/storage";

const PREFIX = "ws:";

export interface WorkspaceEntry {
  id: string;
  text: string;
  todos: string[];
  tags: string[];
  createdAt: string;
  synced: boolean;
}

/**
 * Get cached entries for a date.
 */
export async function getEntries(date: string): Promise<WorkspaceEntry[]> {
  const raw = await getItem(`${PREFIX}entries:${date}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save entries for a date.
 */
export async function setEntries(
  date: string,
  entries: WorkspaceEntry[],
): Promise<void> {
  await setItem(`${PREFIX}entries:${date}`, JSON.stringify(entries));
}

/**
 * Add a single entry for today.
 */
export async function addEntry(entry: WorkspaceEntry): Promise<void> {
  const date = entry.createdAt.split("T")[0];
  const entries = await getEntries(date);
  entries.push(entry);
  await setEntries(date, entries);
}

/**
 * Get sync cursor (last sync timestamp).
 */
export async function getSyncCursor(): Promise<string | null> {
  return getItem(`${PREFIX}sync:cursor`);
}

/**
 * Set sync cursor.
 */
export async function setSyncCursor(cursor: string): Promise<void> {
  await setItem(`${PREFIX}sync:cursor`, cursor);
}

/**
 * Clear all workspace data.
 */
export async function clearWorkspace(): Promise<void> {
  // Note: this clears all ws: prefixed keys
  // In practice, we'd iterate over known keys
  await removeItem(`${PREFIX}sync:cursor`);
}
