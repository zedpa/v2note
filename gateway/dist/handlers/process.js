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
/**
 * Process a single diary entry: run active skills to extract structured data.
 */
export async function processEntry(payload) {
    // 1. Load skills
    const allSkills = loadSkills(SKILLS_DIR);
    // Load device-specific skill config
    const skillConfigs = await skillConfigRepo.findByDevice(payload.deviceId);
    const activeSkills = filterActiveSkills(allSkills, skillConfigs.map((c) => ({ skill_name: c.skill_name, enabled: c.enabled })));
    // 2. Load soul + memory for context
    const soul = await loadSoul(payload.deviceId);
    const memoryManager = new MemoryManager();
    const memories = await memoryManager.loadContext(payload.deviceId);
    // 3. Build prompt
    const systemPrompt = buildSystemPrompt({
        skills: activeSkills,
        soul: soul?.content,
        memory: memories,
        mode: "process",
    });
    // 4. Call AI
    const response = await chatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: payload.text },
    ], { json: true, temperature: 0.3 });
    // 5. Parse result
    let result = {
        todos: [],
        customer_requests: [],
        setting_changes: [],
        tags: [],
    };
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
    }
    catch {
        console.error("Failed to parse AI response:", response.content);
    }
    // 6. Write extracted data
    if (result.todos.length > 0) {
        await todoRepo.createMany(result.todos.map((text) => ({
            record_id: payload.recordId,
            text,
            done: false,
        })));
    }
    if (result.customer_requests.length > 0) {
        await customerRequestRepo.create(result.customer_requests.map((text) => ({
            record_id: payload.recordId,
            text,
            status: "pending",
        })));
    }
    if (result.setting_changes.length > 0) {
        await settingChangeRepo.create(result.setting_changes.map((text) => ({
            record_id: payload.recordId,
            text,
            applied: false,
        })));
    }
    // 7. Save tags
    if (result.tags.length > 0) {
        for (const tagName of result.tags) {
            const tag = await tagRepo.upsert(tagName);
            await tagRepo.addToRecord(payload.recordId, tag.id);
        }
    }
    // 8. Update record status
    await recordRepo.updateStatus(payload.recordId, "completed");
    // 9. Background: maybe create long-term memory & update soul
    const today = new Date().toISOString().split("T")[0];
    memoryManager.maybeCreateMemory(payload.deviceId, payload.text, today).catch(() => { });
    updateSoul(payload.deviceId, payload.text).catch(() => { });
    return result;
}
//# sourceMappingURL=process.js.map