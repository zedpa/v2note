import { loadSkills, filterActiveSkills, mergeWithCustomSkills } from "../skills/loader.js";
import { buildProcessPrompt } from "./process-prompt.js";
import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { MemoryManager } from "../memory/manager.js";
import { updateSoul } from "../soul/manager.js";
import { updateProfile } from "../profile/manager.js";
import { appendToDiary } from "../diary/manager.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { skillConfigRepo } from "../db/repositories/index.js";
import { todoRepo } from "../db/repositories/index.js";
import { customerRequestRepo } from "../db/repositories/index.js";
import { settingChangeRepo } from "../db/repositories/index.js";
import { tagRepo } from "../db/repositories/index.js";
import { recordRepo } from "../db/repositories/index.js";
import { summaryRepo } from "../db/repositories/index.js";
import { goalRepo } from "../db/repositories/index.js";
import { pendingIntentRepo } from "../db/repositories/index.js";
import { extractKeywords, maySoulUpdate, mayProfileUpdate } from "../lib/text-utils.js";
import { estimateBatchTodos } from "../proactive/time-estimator.js";
import { getSession } from "../session/manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../../skills");

export interface LocalConfigPayload {
  soul?: { content: string };
  skills?: { configs: Array<{ name: string; enabled: boolean; description?: string; type?: string; prompt?: string; builtin?: boolean }> };
  settings?: Record<string, unknown>;
  existingTags?: string[];
}

export interface ProcessPayload {
  text: string;
  audioUrl?: string;
  deviceId: string;
  userId?: string;
  recordId: string;
  notebook?: string;
  localConfig?: LocalConfigPayload;
}

export interface RelayExtract {
  text: string;
  source_person?: string;
  target_person?: string;
  context?: string;
  direction?: "outgoing" | "incoming";
}

export interface IntentSignal {
  type: "task" | "wish" | "goal" | "complaint" | "reflection";
  text: string;
  context?: string;
}

export interface ProcessResult {
  todos: string[];
  intents: IntentSignal[];
  pending_followups: number;
  customer_requests: string[];
  setting_changes: string[];
  tags: string[];
  relays: RelayExtract[];
  summary?: string;
  error?: string;
}


/**
 * Process a single diary entry: hardcoded prompt + optional skills.
 */
export async function processEntry(payload: ProcessPayload): Promise<ProcessResult> {
  const result: ProcessResult = {
    todos: [],
    intents: [],
    pending_followups: 0,
    customer_requests: [],
    setting_changes: [],
    tags: [],
    relays: [],
  };

  try {
    console.log(`[process] Starting for record ${payload.recordId}, text length: ${payload.text.length}`);

    // 1. Load optional skills (lightweight — just read files for prompt text)
    const builtinSkills = loadSkills(SKILLS_DIR);
    const allSkills = mergeWithCustomSkills(builtinSkills, payload.localConfig?.skills?.configs as any);

    // Load skill config: prefer localConfig, fall back to server DB
    let skillConfigs: Array<{ skill_name: string; enabled: boolean }> = [];
    if (payload.localConfig?.skills?.configs) {
      skillConfigs = payload.localConfig.skills.configs.map((c) => ({
        skill_name: c.name,
        enabled: c.enabled,
      }));
    } else {
      try {
        const configs = payload.userId
          ? await skillConfigRepo.findByUser(payload.userId)
          : await skillConfigRepo.findByDevice(payload.deviceId);
        skillConfigs = configs.map((c) => ({ skill_name: c.skill_name, enabled: c.enabled }));
      } catch (err: any) {
        console.warn(`[process] Failed to load skill config: ${err.message}`);
      }
    }

    // Only load optional (non-hardcoded) skills — filter by enabled
    const enabledSkills = filterActiveSkills(allSkills, skillConfigs);
    const optionalPrompts = enabledSkills.map(s => `### ${s.name}\n${s.prompt}`);
    console.log(`[process] Optional skills: ${enabledSkills.map(s => s.name).join(", ") || "(none)"}`);

    // 2. Build hardcoded prompt + optional skill appendage
    const systemPrompt = buildProcessPrompt({
      existingTags: payload.localConfig?.existingTags,
      optionalSkillPrompts: optionalPrompts,
    });
    console.log(`[process] System prompt length: ${systemPrompt.length}`);

    // 3. Call AI
    const dynamicTimeout = Math.min(300_000, 60_000 + Math.floor(payload.text.length / 1000) * 20_000);
    console.log(`[process] Calling AI... (timeout: ${dynamicTimeout}ms, text: ${payload.text.length} chars)`);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: payload.text },
    ];

    const response = await chatCompletion(messages, { json: true, temperature: 0.3, timeout: dynamicTimeout });

    if (!response) {
      throw new Error("AI provider returned null response");
    }

    console.log(`[process] AI response length: ${response.content.length}, usage: ${JSON.stringify(response.usage)}`);

    // 4. Parse result
    if (!response.content.trim()) {
      console.error("[process] AI returned empty content");
      result.error = "AI returned empty response";
    } else {
      try {
        const parsed = JSON.parse(response.content);

        // Intent array (from hardcoded intent-classify rules)
        if (Array.isArray(parsed.intents)) {
          result.intents = parsed.intents;
          result.todos = parsed.intents
            .filter((i: any) => i.type === "task")
            .map((i: any) => i.text);
        } else {
          // Old format fallback
          result.todos = Array.isArray(parsed.todos) ? parsed.todos : [];
          result.intents = result.todos.map((t) => ({ type: "task" as const, text: t }));
        }

        result.customer_requests = Array.isArray(parsed.customer_requests)
          ? parsed.customer_requests
          : [];
        result.setting_changes = Array.isArray(parsed.setting_changes)
          ? parsed.setting_changes
          : [];
        result.tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        result.relays = Array.isArray(parsed.relays) ? parsed.relays : [];
        result.summary = typeof parsed.summary === "string" ? parsed.summary : undefined;

        // Filter tags: only keep tags that exist in the provided existing tags list
        if (payload.localConfig?.existingTags && result.tags.length > 0) {
          const existingSet = new Set(payload.localConfig.existingTags);
          result.tags = result.tags.filter((t: string) => existingSet.has(t));
        }

        console.log(`[process] Parsed: ${result.todos.length} todos, ${result.intents.length} intents, ${result.customer_requests.length} requests, ${result.relays.length} relays, ${result.tags.length} tags, summary: ${result.summary ? 'yes' : 'no'}`);
      } catch {
        console.error("[process] Failed to parse AI response as JSON:", response.content.slice(0, 500));
        result.error = "AI response is not valid JSON";
      }
    }

    // 5. Write extracted data to DB
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

      // Write relay todos
      if (result.relays.length > 0) {
        for (const relay of result.relays) {
          await todoRepo.createWithCategory({
            record_id: payload.recordId,
            text: relay.text,
            done: false,
            category: "relay",
            relay_meta: {
              source_person: relay.source_person,
              target_person: relay.target_person,
              context: relay.context,
              direction: relay.direction,
            },
          });
        }
        console.log(`[process] Created ${result.relays.length} relay todos`);
      }

      // Route non-task intents to pending_intent table
      const nonTaskIntents = result.intents.filter((i) => i.type !== "task");
      for (const intent of nonTaskIntents) {
        if (intent.type === "wish" || intent.type === "goal") {
          await pendingIntentRepo.create({
            device_id: payload.deviceId,
            user_id: payload.userId,
            record_id: payload.recordId,
            intent_type: intent.type,
            text: intent.text,
            context: intent.context,
          });
        }
      }
      result.pending_followups = nonTaskIntents.filter(
        (i) => i.type === "wish" || i.type === "goal",
      ).length;
      if (result.pending_followups > 0) {
        console.log(`[process] Created ${result.pending_followups} pending intents`);
      }

      // Auto-link new todos to active goals by keyword matching
      if (result.todos.length > 0) {
        try {
          const activeGoals = payload.userId
            ? await goalRepo.findActiveByUser(payload.userId)
            : await goalRepo.findActiveByDevice(payload.deviceId);
          if (activeGoals.length > 0) {
            const recentTodos = await todoRepo.findByRecordId(payload.recordId);
            for (const todo of recentTodos) {
              const todoKeywords = extractKeywords(todo.text);
              let bestGoal: { id: string; score: number } | null = null;
              for (const goal of activeGoals) {
                const goalKeywords = extractKeywords(goal.title);
                let overlap = 0;
                for (const kw of todoKeywords) {
                  if (goalKeywords.has(kw)) overlap++;
                }
                const score = goalKeywords.size > 0 ? overlap / goalKeywords.size : 0;
                if (score > 0.3 && (!bestGoal || score > bestGoal.score)) {
                  bestGoal = { id: goal.id, score };
                }
              }
              if (bestGoal) {
                await todoRepo.update(todo.id, { goal_id: bestGoal.id } as any);
                console.log(`[process] Linked todo "${todo.text}" to goal ${bestGoal.id} (score: ${bestGoal.score.toFixed(2)})`);
              }
            }
          }
        } catch (err: any) {
          console.warn(`[process] Goal linking failed: ${err.message}`);
        }
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

      // Save tags — only associate existing tags, never create new ones
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

      // Save de-colloquialized summary to database
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
    }

    // 6. Update record status
    await recordRepo.updateStatus(payload.recordId, "completed");
    console.log(`[process] Record ${payload.recordId} marked as completed`);

    // 7. Background: enrich new todos
    if (result.todos.length > 0) {
      const pendingTodos = payload.userId
        ? await todoRepo.findPendingByUser(payload.userId)
        : await todoRepo.findPendingByDevice(payload.deviceId);
      const newTodos = pendingTodos.slice(-result.todos.length);
      if (newTodos.length > 0) {
        // Load memories only for enrichment (not injected into process prompt)
        let goalMemories: string[] = [];
        try {
          const activeGoals = payload.userId
            ? await goalRepo.findActiveByUser(payload.userId)
            : await goalRepo.findActiveByDevice(payload.deviceId);
          const session = getSession(payload.deviceId);
          const memoryManager = session.memoryManager;
          const loaded = await memoryManager.loadRelevantContext(payload.deviceId, {
            mode: "chat",
            inputText: payload.text,
            userId: payload.userId,
          });
          const memories = loaded.memories;

          if (activeGoals.length > 0) {
            goalMemories = activeGoals.map((g) => `[目标] ${g.title}`);
          }
          goalMemories = goalMemories.concat(memories.slice(0, 5));
        } catch {
          // fallback: no memories for enrichment
        }

        estimateBatchTodos(
          newTodos.map((t) => ({ id: t.id, text: t.text })),
          { memories: goalMemories },
        )
          .then(async (estimates) => {
            for (const [todoId, estimate] of estimates) {
              await todoRepo.update(todoId, {
                estimated_minutes: estimate.estimated_minutes,
                priority: estimate.priority,
                domain: estimate.domain,
                impact: estimate.impact,
                ai_actionable: estimate.ai_actionable,
                ai_action_plan: estimate.ai_action_plan ?? null,
              });
            }
            console.log(`[process] Todo enrichment updated for ${estimates.size} todos`);
          })
          .catch((err) => {
            console.warn("[process] Todo enrichment failed:", err.message);
          });
      }
    }

    // 8. Background: maybe create long-term memory, conditionally update soul & profile
    const today = new Date().toISOString().split("T")[0];
    const session = getSession(payload.deviceId);
    const memoryManager = session.memoryManager;

    memoryManager.maybeCreateMemory(payload.deviceId, payload.text, today, payload.userId).catch((e) => {
      console.warn("[process] Memory creation failed:", e.message);
    });

    // Soul/Profile: only update when text likely contains relevant content
    const text = payload.text;

    if (maySoulUpdate(text)) {
      updateSoul(payload.deviceId, text, payload.userId).catch((e) => {
        console.warn("[process] Soul update failed:", e.message);
      });
    }
    if (mayProfileUpdate(text)) {
      updateProfile(payload.deviceId, text, payload.userId).catch((e) => {
        console.warn("[process] Profile update failed:", e.message);
      });
    }

    // Append to daily diary
    const diaryLine = result.summary
      ? `[${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${result.summary}`
      : `[${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${payload.text.slice(0, 200)}`;
    const diaryNotebook = payload.notebook && payload.notebook !== "ai-self" ? payload.notebook : "default";
    console.log(`[process] Diary append: payload.notebook=${payload.notebook}, target=${diaryNotebook}`);
    appendToDiary(payload.deviceId, diaryNotebook, diaryLine, payload.userId).catch((e) => {
      console.warn("[process] Diary append failed:", e.message);
    });
  } catch (err: any) {
    console.error(`[process] Fatal error processing record ${payload.recordId}:`, err);

    try {
      await recordRepo.updateStatus(payload.recordId, "error");
    } catch {
      console.error("[process] Also failed to update record status to error");
    }

    result.error = err.message;
  }

  return result;
}
