import { getDeviceId } from "@/shared/lib/device";
import { emit } from "@/features/recording/lib/events";
import { createManualNote as apiCreateManualNote } from "@/shared/lib/api/records";

export interface ManualNoteInput {
  content: string;
  tags?: string[];
  useAi?: boolean;
}

/**
 * Create a manual text note. Optionally invoke AI analysis.
 */
export async function createManualNote(input: ManualNoteInput): Promise<string> {
  await getDeviceId(); // ensure API deviceId is set

  emit("recording:uploaded");
  const result = await apiCreateManualNote({
    content: input.content,
    tags: input.tags,
    useAi: input.useAi,
  });
  emit("recording:processed");

  return result.id;
}
