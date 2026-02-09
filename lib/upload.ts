import { supabase } from "./supabase";
import { getDeviceId } from "./device";

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return new Blob([buffer], { type: mimeType });
}

export interface UploadResult {
  recordId: string;
  audioPath: string;
  audioUrl: string;
}

export async function uploadAudio(
  base64: string,
  mimeType: string,
  durationSeconds: number,
  locationText?: string,
): Promise<UploadResult> {
  const deviceId = await getDeviceId();

  // Determine file extension from mimeType
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a")
    ? "m4a"
    : mimeType.includes("webm")
      ? "webm"
      : mimeType.includes("ogg")
        ? "ogg"
        : "m4a";

  const fileName = `${deviceId}/${Date.now()}.${ext}`;

  // 1. Create record row first
  const { data: record, error: recordError } = await supabase
    .from("record")
    .insert({
      device_id: deviceId,
      status: "uploading",
      audio_path: fileName,
      duration_seconds: durationSeconds,
      location_text: locationText ?? null,
    })
    .select("id")
    .single();

  if (recordError || !record) {
    throw new Error(`Failed to create record: ${recordError?.message}`);
  }

  // 2. Upload audio to storage
  const blob = base64ToBlob(base64, mimeType);
  const { error: uploadError } = await supabase.storage
    .from("audio-recordings")
    .upload(fileName, blob, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    // Clean up the record row
    await supabase.from("record").delete().eq("id", record.id);
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  // 3. Update record status
  await supabase
    .from("record")
    .update({ status: "uploaded" })
    .eq("id", record.id);

  // 4. Get public URL
  const { data: urlData } = supabase.storage
    .from("audio-recordings")
    .getPublicUrl(fileName);

  return {
    recordId: record.id,
    audioPath: fileName,
    audioUrl: urlData.publicUrl,
  };
}
