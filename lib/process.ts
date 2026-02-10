import { supabase } from "./supabase";
import { getUserType } from "./settings";

export async function processRecording(
  recordId: string,
  audioUrl: string,
): Promise<void> {
  const userType = await getUserType();

  const { data, error } = await supabase.functions.invoke("process_audio", {
    body: {
      record_id: recordId,
      audio_url: audioUrl,
      user_type: userType,
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
