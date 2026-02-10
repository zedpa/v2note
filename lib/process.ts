import { supabase } from "./supabase";

export async function processRecording(
  recordId: string,
  audioUrl: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("process_audio", {
    body: {
      record_id: recordId,
      audio_url: audioUrl,
    },
  });

  if (error) {
    // Try to extract detailed error from response context
    let detail = error.message;
    try {
      if ("context" in error && error.context instanceof Response) {
        const body = await error.context.json();
        detail = body?.error || detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }
}
