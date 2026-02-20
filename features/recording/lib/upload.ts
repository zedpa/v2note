import { getDeviceId } from "@/shared/lib/device";
import { createRecord, updateRecord } from "@/shared/lib/api/records";

export interface UploadResult {
  recordId: string;
  audioPath: string;
  audioUrl: string;
}

/**
 * Create a record for an audio recording.
 * Note: In the new architecture, audio is streamed via WebSocket ASR.
 * This function is kept for backward compatibility but will be removed in Phase D.
 */
export async function uploadAudio(
  _base64: string,
  _mimeType: string,
  durationSeconds: number,
  locationText?: string,
): Promise<UploadResult> {
  await getDeviceId();

  const result = await createRecord({
    status: "uploaded",
    source: "voice",
    location_text: locationText ?? undefined,
  });

  await updateRecord(result.id, { duration_seconds: durationSeconds });

  return {
    recordId: result.id,
    audioPath: "",
    audioUrl: "",
  };
}
