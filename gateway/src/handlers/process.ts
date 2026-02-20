import { loadSkills, filterActiveSkills } from "../skills/loader.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";
import { chatCompletion } from "../ai/provider.js";
import { MemoryManager } from "../memory/manager.js";
import { updateSoul } from "../soul/manager.js";
import { loadSoul } from "../soul/manager.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { skillConfigRepo } from "../db/repositories/index.js";
import { todoRepo } from "../db/repositories/index.js";
import { customerRequestRepo } from "../db/repositories/index.js";
import { settingChangeRepo } from "../db/repositories/index.js";
import { tagRepo } from "../db/repositories/index.js";
import { recordRepo } from "../db/repositories/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../../skills");

export interface ProcessPayload {
  text: string;
  audioUrl?: string;
  deviceId: string;
  recordId: string;
}

export interface ProcessResult {
  todos: string[];
  customer_requests: string[];
  setting_changes: string[];
  tags: string[];
  error?: string;
}

/**
 * Process a single diary entry: run active skills to extract structured data.
 */
export async function processEntry(payload: ProcessPayload): Promise<ProcessResult> {
  const result: ProcessResult = {
    todos: [],
    customer_requests: [],
    setting_changes: [],
    tags: [],
  };

  try {
    // 1. Load skills
    console.log(`[process] Starting for record ${payload.recordId}, text length: ${payload.text.length}`);
    const allSkills = loadSkills(SKILLS_DIR);
    console.log(`[process] Loaded ${allSkills.length} skills: ${allSkills.map(s => s.name).join(", ")}`);

    // Load device-specific skill config
    let skillConfigs: Array<{ skill_name: string; enabled: boolean }> = [];
    try {
      skillConfigs = (await skillConfigRepo.findByDevice(payload.deviceId))
        .map((c) => ({ skill_name: c.skill_name, enabled: c.enabled }));
    } catch (err: any) {
      console.warn(`[process] Failed to load skill config (table may not exist): ${err.message}`);
    }

    const activeSkills = filterActiveSkills(allSkills, skillConfigs);
    console.log(`[process] Active skills: ${activeSkills.map(s => s.name).join(", ")}`);

    if (activeSkills.length === 0) {
      console.warn("[process] No active skills — nothing to extract");
    }

    // 2. Load soul + memory for context (non-critical, continue on failure)
    let soulContent: string | undefined;
    let memories: string[] = [];

    try {
      const soul = await loadSoul(payload.deviceId);
      soulContent = soul?.content;
    } catch (err: any) {
      console.warn(`[process] Failed to load soul: ${err.message}`);
    }

    try {
      const memoryManager = new MemoryManager();
      memories = await memoryManager.loadContext(payload.deviceId);
    } catch (err: any) {
      console.warn(`[process] Failed to load memory: ${err.message}`);
    }

    // 3. Build prompt
    const systemPrompt = buildSystemPrompt({
      skills: activeSkills,
      soul: soulContent,
      memory: memories,
      mode: "process",
    });
    console.log(`[process] System prompt length: ${systemPrompt.length}`);

    // 4. Call AI
    console.log("[process] Calling AI...");
    const response = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: payload.text },
      ],
      { json: true, temperature: 0.3 },
    );
    console.log(`[process] AI response length: ${response.content.length}, usage: ${JSON.stringify(response.usage)}`);

    // 5. Parse result
    if (!response.content.trim()) {
      console.error("[process] AI returned empty content");
      result.error = "AI returned empty response";
    } else {
      try {
        const parsed = JSON.parse(response.content);
        result.todos = Array.isArray(parsed.todos) ? parsed.todos : [];
        result.customer_requests = Array.isArray(parsed.customer_requests)
          ? parsed.customer_requests
          : [];
        result.setting_changes = Array.isArray(parsed.setting_changes)
          ? parsed.setting_changes
          : [];
        result.tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        console.log(`[process] Parsed: ${result.todos.length} todos, ${result.customer_requests.length} requests, ${result.tags.length} tags`);
      } catch {
        console.error("[process] Failed to parse AI response as JSON:", response.content.slice(0, 500));
        result.error = "AI response is not valid JSON";
      }
    }

    // 6. Write extracted data to DB
    try {
      if (result.todos.length > 0) {
        await todoRepo.createMany(
          result.todos.map((text) => ({
            record_id: payload.recordId,
            text,
            done: false,
          })),
        );
      }

      if (result.customer_requests.length > 0) {
        await customerRequestRepo.create(
          result.customer_requests.map((text) => ({
            record_id: payload.recordId,
            text,
            status: "pending",
          })),
        );
      }

      if (result.setting_changes.length > 0) {
        await settingChangeRepo.create(
          result.setting_changes.map((text) => ({
            record_id: payload.recordId,
            text,
            applied: false,
          })),
        );
      }

      // 7. Save tags
      if (result.tags.length > 0) {
        for (const tagName of result.tags) {
          const tag = await tagRepo.upsert(tagName);
          await tagRepo.addToRecord(payload.recordId, tag.id);
        }
      }
    } catch (err: any) {
      console.error(`[process] DB write error: ${err.message}`);
      // Don't block — still update status and return result
    }

    // 8. Update record status
    await recordRepo.updateStatus(payload.recordId, "completed");
    console.log(`[process] Record ${payload.recordId} marked as completed`);

    // 9. Background: maybe create long-term memory & update soul
    const memoryManager = new MemoryManager();
    const today = new Date().toISOString().split("T")[0];
    memoryManager.maybeCreateMemory(payload.deviceId, payload.text, today).catch((e) => {
      console.warn("[process] Memory creation failed:", e.message);
    });
    updateSoul(payload.deviceId, payload.text).catch((e) => {
      console.warn("[process] Soul update failed:", e.message);
    });
  } catch (err: any) {
    console.error(`[process] Fatal error processing record ${payload.recordId}:`, err);

    // Ensure record status is updated even on failure
    try {
      await recordRepo.updateStatus(payload.recordId, "error");
    } catch {
      console.error("[process] Also failed to update record status to error");
    }

    result.error = err.message;
  }

  return result;
}
