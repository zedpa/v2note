import { supabase } from "./supabase";

export async function processRecording(
  recordId: string,
  audioUrl: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke("process_audio", {
    body: {
      record_id: recordId,
      audio_url: audioUrl,
    },
  });

  if (error) {
    throw new Error(`Processing failed: ${error.message}`);
  }
}
