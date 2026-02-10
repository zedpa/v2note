import { supabase } from "./supabase";
import { getDeviceId } from "./device";
import { emit } from "./events";
import { getUserType } from "./settings";

export interface ManualNoteInput {
  title: string;
  content: string;
  tags?: string[];
  useAi?: boolean;
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

  if (input.useAi) {
    // Invoke AI processing with text (skip ASR)
    emit("recording:uploaded");
    try {
      const userType = await getUserType();
      const { error } = await supabase.functions.invoke("process_audio", {
        body: {
          record_id: record.id,
          text: input.content,
          user_type: userType,
        },
      });
      if (error) throw error;
      emit("recording:processed");
    } catch {
      emit("recording:processed");
    }
  } else {
    // Manual summary without AI
    await supabase.from("summary").insert({
      record_id: record.id,
      title: input.title || input.content.slice(0, 20),
      short_summary: input.content.slice(0, 200),
      long_summary: input.content,
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
