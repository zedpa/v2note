import { supabase } from "./supabase";
import { getUserType } from "./settings";
import { getCustomTags, getAvailableTags } from "./tag-manager";

export async function processRecording(
  recordId: string,
  audioUrl: string,
): Promise<void> {
  const userType = await getUserType();
  const customTags = await getCustomTags();
  const availableTags = getAvailableTags(customTags);

  const { data, error } = await supabase.functions.invoke("process_audio", {
    body: {
      record_id: recordId,
      audio_url: audioUrl,
      user_type: userType,
      available_tags: availableTags,
    },
  });

  if (error) {
    // Try to extract detailed error from response context
    let detail = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        detail = body?.error || detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }
}
