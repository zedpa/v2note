import { supabase } from "./supabase";
import { getDeviceId } from "./device";
import { emit } from "./events";
import { getUserType } from "./settings";
import { getCustomTags, getAvailableTags } from "./tag-manager";

export interface ManualNoteInput {
  content: string;
  tags?: string[];
  useAi?: boolean;
}

function extractTitle(text: string): string {
  const match = text.match(/^[^。！？!?.]+/);
  const firstSentence = match ? match[0].trim() : text.trim();
  return firstSentence.slice(0, 8);
}

/**
 * Create a manual text note. Optionally invoke AI analysis.
 */
export async function createManualNote(input: ManualNoteInput): Promise<string> {
  const deviceId = await getDeviceId();

  // 1. Create record
  const { data: record, error: recordError } = await supabase
    .from("record")
    .insert({
      device_id: deviceId,
      status: input.useAi ? "uploaded" : "completed",
      source: "manual",
      duration_seconds: 0,
    })
    .select("id")
    .single();

  if (recordError || !record) {
    throw new Error(`Failed to create record: ${recordError?.message}`);
  }

  // 2. Insert transcript (store the raw text)
  await supabase.from("transcript").insert({
    record_id: record.id,
    text: input.content,
  });

  const title = extractTitle(input.content);

  if (input.useAi) {
    // Invoke AI processing with text (skip ASR)
    emit("recording:uploaded");
    try {
      const userType = await getUserType();
      const customTags = await getCustomTags();
      const availableTags = getAvailableTags(customTags);

      const { error } = await supabase.functions.invoke("process_audio", {
        body: {
          record_id: record.id,
          text: input.content,
          user_type: userType,
          available_tags: availableTags,
        },
      });
      if (error) throw error;
      emit("recording:processed");
    } catch {
      emit("recording:processed");
    }
  } else {
    // Manual save without AI
    await supabase.from("summary").insert({
      record_id: record.id,
      title,
      short_summary: "",
      long_summary: "",
    });

    // Insert tags if provided
    for (const tagName of input.tags ?? []) {
      const { data: tagData } = await supabase
        .from("tag")
        .upsert({ name: tagName }, { onConflict: "name" })
        .select("id")
        .single();

      if (tagData) {
        await supabase.from("record_tag").insert({
          record_id: record.id,
          tag_id: tagData.id,
        });
      }
    }

    emit("recording:processed");
  }

  return record.id;
}
