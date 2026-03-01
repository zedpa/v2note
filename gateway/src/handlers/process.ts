import { loadSkills, filterActiveSkills } from "../skills/loader.js";
import { buildSystemPrompt } from "../skills/prompt-builder.js";
import { chatCompletion, type ChatMessage } from "../ai/provider.js";
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
import { summaryRepo } from "../db/repositories/index.js";
import { getMCPRegistry } from "../mcp/registry.js";
import { estimateBatchTodos } from "../proactive/time-estimator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../../skills");

export interface LocalConfigPayload {
  soul?: { content: string };
  skills?: { configs: Array<{ name: string; enabled: boolean }> };
  settings?: Record<string, unknown>;
  existingTags?: string[];
}

export interface ProcessPayload {
  text: string;
  audioUrl?: string;
  deviceId: string;
  recordId: string;
  localConfig?: LocalConfigPayload;
}

export interface ProcessResult {
  todos: string[];
  customer_requests: string[];
  setting_changes: string[];
  tags: string[];
  summary?: string;
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

    // Load skill config: prefer localConfig, fall back to server DB
    let skillConfigs: Array<{ skill_name: string; enabled: boolean }> = [];
    if (payload.localConfig?.skills?.configs) {
      skillConfigs = payload.localConfig.skills.configs.map((c) => ({
        skill_name: c.name,
        enabled: c.enabled,
      }));
      console.log(`[process] Using local skill config`);
    } else {
      try {
        skillConfigs = (await skillConfigRepo.findByDevice(payload.deviceId))
          .map((c) => ({ skill_name: c.skill_name, enabled: c.enabled }));
      } catch (err: any) {
        console.warn(`[process] Failed to load skill config (table may not exist): ${err.message}`);
      }
    }

    const activeSkills = filterActiveSkills(allSkills, skillConfigs);
    console.log(`[process] Active skills: ${activeSkills.map(s => s.name).join(", ")}`);

    if (activeSkills.length === 0) {
      console.warn("[process] No active skills — nothing to extract");
    }

    // 2. Load soul + memory for context (non-critical, continue on failure)
    // Prefer localConfig soul, fall back to server DB
    let soulContent: string | undefined;
    let memories: string[] = [];

    if (payload.localConfig?.soul?.content) {
      soulContent = payload.localConfig.soul.content;
      console.log(`[process] Using local soul config`);
    } else {
      try {
        const soul = await loadSoul(payload.deviceId);
        soulContent = soul?.content;
      } catch (err: any) {
        console.warn(`[process] Failed to load soul: ${err.message}`);
      }
    }

    try {
      const memoryManager = new MemoryManager();
      memories = await memoryManager.loadContext(payload.deviceId);
    } catch (err: any) {
      console.warn(`[process] Failed to load memory: ${err.message}`);
    }

    // 3. Build prompt with MCP tools if available
    const mcpRegistry = getMCPRegistry();
    const mcpTools = mcpRegistry.hasTools() ? mcpRegistry.getToolsForPrompt() : undefined;

    const systemPrompt = buildSystemPrompt({
      skills: activeSkills,
      soul: soulContent,
      memory: memories,
      mode: "process",
      existingTags: payload.localConfig?.existingTags,
      mcpTools,
    });
    console.log(`[process] System prompt length: ${systemPrompt.length}, MCP tools: ${mcpTools?.length ?? 0}`);

    // 4. Call AI (with tool call loop)
    // Dynamic timeout: base 60s + 20s per 1000 chars of input, capped at 5min
    const dynamicTimeout = Math.min(300_000, 60_000 + Math.floor(payload.text.length / 1000) * 20_000);
    console.log(`[process] Calling AI... (timeout: ${dynamicTimeout}ms, text: ${payload.text.length} chars)`);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: payload.text },
    ];

    let response = await chatCompletion(messages, { json: true, temperature: 0.3, timeout: dynamicTimeout });
    console.log(`[process] AI response length: ${response.content.length}, usage: ${JSON.stringify(response.usage)}`);

    // Tool call loop: if AI requests tool calls, execute them and re-call AI
    const MAX_TOOL_ROUNDS = 3;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (!response.content.trim()) break;

      let parsed: any;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        break;
      }

      if (!Array.isArray(parsed.tool_calls) || parsed.tool_calls.length === 0) break;

      console.log(`[process] Tool call round ${round + 1}: ${parsed.tool_calls.length} calls`);

      // Execute tool calls
      const toolResults: string[] = [];
      for (const call of parsed.tool_calls) {
        try {
          const toolResult = await mcpRegistry.callTool(call.name, call.arguments ?? {});
          const text = toolResult.content.map((c: any) => c.text ?? "").join("\n");
          toolResults.push(`Tool "${call.name}" result: ${text}`);
          console.log(`[process] Tool ${call.name}: success`);
        } catch (err: any) {
          toolResults.push(`Tool "${call.name}" error: ${err.message}`);
          console.warn(`[process] Tool ${call.name}: ${err.message}`);
        }
      }

      // Add tool results and re-call AI
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: `工具调用结果：\n${toolResults.join("\n\n")}\n\n请基于工具结果，返回最终的 JSON 结果。` });

      response = await chatCompletion(messages, { json: true, temperature: 0.3, timeout: dynamicTimeout });
      console.log(`[process] AI re-response length: ${response.content.length}`);
    }

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
        result.summary = typeof parsed.summary === "string" ? parsed.summary : undefined;

        // Filter tags: only keep tags that exist in the provided existing tags list
        if (payload.localConfig?.existingTags && result.tags.length > 0) {
          const existingSet = new Set(payload.localConfig.existingTags);
          result.tags = result.tags.filter((t: string) => existingSet.has(t));
        }

        console.log(`[process] Parsed: ${result.todos.length} todos, ${result.customer_requests.length} requests, ${result.tags.length} tags, summary: ${result.summary ? 'yes' : 'no'}`);
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

      // 7. Save tags — only associate existing tags, never create new ones
      if (result.tags.length > 0) {
        for (const tagName of result.tags) {
          const tag = await tagRepo.findByName(tagName);
          if (tag) {
            await tagRepo.addToRecord(payload.recordId, tag.id);
          } else {
            console.log(`[process] Skipping unknown tag: ${tagName}`);
          }
        }
      }

      // 8. Save de-colloquialized summary to database
      if (result.summary) {
        const existing = await summaryRepo.findByRecordId(payload.recordId);
        if (existing) {
          await summaryRepo.update(payload.recordId, { short_summary: result.summary });
        } else {
          await summaryRepo.create({
            record_id: payload.recordId,
            title: result.summary.slice(0, 50),
            short_summary: result.summary,
          });
        }
        console.log(`[process] Summary saved for record ${payload.recordId}`);
      }
    } catch (err: any) {
      console.error(`[process] DB write error: ${err.message}`);
      // Don't block — still update status and return result
    }

    // 9. Update record status
    await recordRepo.updateStatus(payload.recordId, "completed");
    console.log(`[process] Record ${payload.recordId} marked as completed`);

    // 10. Background: estimate time for new todos
    if (result.todos.length > 0) {
      const pendingTodos = await todoRepo.findPendingByDevice(payload.deviceId);
      const newTodos = pendingTodos.slice(-result.todos.length); // latest N todos
      if (newTodos.length > 0) {
        estimateBatchTodos(
          newTodos.map((t) => ({ id: t.id, text: t.text })),
          { soul: soulContent },
        )
          .then(async (estimates) => {
            for (const [todoId, estimate] of estimates) {
              await todoRepo.update(todoId, {
                estimated_minutes: estimate.estimated_minutes,
                priority: estimate.priority,
              });
            }
            console.log(`[process] Time estimates updated for ${estimates.size} todos`);
          })
          .catch((err) => {
            console.warn("[process] Time estimation failed:", err.message);
          });
      }
    }

    // 11. Background: maybe create long-term memory & update soul
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
