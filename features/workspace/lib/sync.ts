import { getDeviceId } from "@/shared/lib/device";
import { getEntries, setEntries, getSyncCursor, setSyncCursor } from "./workspace";
import { pushSync, pullSync } from "@/shared/lib/api/sync";

/**
 * Sync local workspace entries to Gateway.
 * Uploads any unsynced entries and pulls new remote data.
 */
export async function syncWorkspace(): Promise<{
  uploaded: number;
  downloaded: number;
}> {
  await getDeviceId(); // ensure API deviceId is set
  let uploaded = 0;
  let downloaded = 0;

  // 1. Upload unsynced local entries
  const today = new Date().toISOString().split("T")[0];
  const entries = await getEntries(today);
  const unsynced = entries.filter((e) => !e.synced);

  if (unsynced.length > 0) {
    try {
      const result = await pushSync(
        unsynced.map((e) => ({
          text: e.text,
          status: "completed",
          source: "text",
          createdAt: e.createdAt,
        })),
      );
      uploaded = result.uploaded;

      // Mark as synced locally
      for (const entry of unsynced) {
        entry.synced = true;
      }
      await setEntries(today, entries);
    } catch {
      // Will retry next sync
    }
  }

  // 2. Pull new remote data since last sync
  const cursor = await getSyncCursor();
  const pullResult = await pullSync(cursor ?? undefined);

  if (pullResult.records && pullResult.records.length > 0) {
    downloaded = pullResult.records.length;
    if (pullResult.cursor) {
      await setSyncCursor(pullResult.cursor);
    }
  }

  return { uploaded, downloaded };
}
