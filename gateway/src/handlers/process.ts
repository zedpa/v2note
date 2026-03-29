import { digestRecords } from './digest.js';
import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { appendToDiary } from "../diary/manager.js";
import { recordRepo, summaryRepo } from "../db/repositories/index.js";
import { classifyVoiceIntent, executeVoiceAction, type VoiceAction, type ActionExecResult } from "./voice-action.js";

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
  todos?: string[];
  intents?: IntentSignal[];
  pending_followups?: number;
  customer_requests?: string[];
  setting_changes?: string[];
  tags?: string[];
  relays?: RelayExtract[];
  summary?: string;
  error?: string;
  /** voice-action: 执行结果（指令型/混合型时存在） */
  action_results?: ActionExecResult[];
  /** voice-action: 意图类型 (record/action/mixed) */
  voice_intent_type?: "record" | "action" | "mixed";
}

const CLEANUP_SYSTEM_PROMPT = `你是一个转写文本清理工具。对以下语音转写文本进行最小化清理：
- 移除口语填充词（嗯、啊、那个、就是说等）
- 修正错别字和语音识别错误
- 严格保留原文表述结构
- 不改写句式，不合并拆分句子
返回 JSON: {"summary": "清理后的文本"}`;

/**
 * Process a single diary entry: clean transcript text, save summary, trigger digest.
 */
export async function processEntry(payload: ProcessPayload): Promise<ProcessResult> {
  const result: ProcessResult = {};

  try {
    console.log(`[process] Starting for record ${payload.recordId}, text length: ${payload.text.length}`);

    // ── Step 0: Voice action — 意图分类（记录/指令/混合） ──────────
    // 文本长度 > 10 才做分类（太短的不判断）
    if (payload.text.length > 4) {
      try {
        const intentResult = await classifyVoiceIntent(payload.text);
        result.voice_intent_type = intentResult.type;

        if (intentResult.type === "action" || intentResult.type === "mixed") {
          const actionResults = await Promise.all(
            intentResult.actions.map((action) =>
              executeVoiceAction(action, {
                userId: payload.userId,
                deviceId: payload.deviceId,
              }),
            ),
          );
          result.action_results = actionResults;

          // 纯指令型：执行完就返回，不走 Digest 管道
          if (intentResult.type === "action") {
            console.log(`[process] Pure action intent, skipping digest. Results: ${actionResults.length}`);
            await recordRepo.updateStatus(payload.recordId, "completed");
            return result;
          }

          // 混合型：继续走 Digest（只处理记录部分）
          console.log(`[process] Mixed intent, will also digest record portion`);
        }
      } catch (err: any) {
        // 意图分类失败不阻塞，降级为正常记录处理
        console.warn(`[process] Voice intent classification failed, falling back to record: ${err.message}`);
        result.voice_intent_type = "record";
      }
    }

    /* MOVED TO DIGEST — skill loading, complex prompt building, structured extraction
    const builtinSkills = loadSkills(SKILLS_DIR);
    const allSkills = mergeWithCustomSkills(builtinSkills, payload.localConfig?.skills?.configs as any);

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

    const enabledSkills = filterActiveSkills(allSkills, skillConfigs);
    const optionalPrompts = enabledSkills.map(s => `### ${s.name}\n${s.prompt}`);

    const systemPrompt = buildProcessPrompt({
      existingTags: payload.localConfig?.existingTags,
      optionalSkillPrompts: optionalPrompts,
    });
    */

    // 1. Build simplified prompt — only text cleanup
    const messages: ChatMessage[] = [
      { role: "system", content: CLEANUP_SYSTEM_PROMPT },
      { role: "user", content: payload.text },
    ];

    // 2. Call AI
    const dynamicTimeout = Math.min(300_000, 60_000 + Math.floor(payload.text.length / 1000) * 20_000);
    console.log(`[process] Calling AI for text cleanup... (timeout: ${dynamicTimeout}ms, text: ${payload.text.length} chars)`);

    const response = await chatCompletion(messages, { json: true, temperature: 0.3, timeout: dynamicTimeout });

    if (!response) {
      throw new Error("AI provider returned null response");
    }

    console.log(`[process] AI response length: ${response.content.length}, usage: ${JSON.stringify(response.usage)}`);

    // 3. Parse response — only extract summary
    if (!response.content.trim()) {
      console.error("[process] AI returned empty content");
      result.error = "AI returned empty response";
    } else {
      try {
        const parsed = JSON.parse(response.content);
        result.summary = typeof parsed.summary === "string" ? parsed.summary : undefined;
        console.log(`[process] Parsed: summary: ${result.summary ? 'yes' : 'no'}`);

        /* MOVED TO DIGEST — intent/todo/tag/relay extraction
        if (Array.isArray(parsed.intents)) {
          result.intents = parsed.intents;
          result.todos = parsed.intents
            .filter((i: any) => i.type === "task")
            .map((i: any) => i.text);
        } else {
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

        if (payload.localConfig?.existingTags && result.tags.length > 0) {
          const existingSet = new Set(payload.localConfig.existingTags);
          result.tags = result.tags.filter((t: string) => existingSet.has(t));
        }
        */
      } catch {
        console.error("[process] Failed to parse AI response as JSON:", response.content.slice(0, 500));
        result.error = "AI response is not valid JSON";
      }
    }

    // 4. Save summary to DB
    try {
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

      /* MOVED TO DIGEST — todos, customer_requests, relays, intents, goals, settings, tags DB writes
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
      }

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

      if (result.tags.length > 0) {
        for (const tagName of result.tags) {
          const tag = await tagRepo.findByName(tagName);
          if (tag) {
            await tagRepo.addToRecord(payload.recordId, tag.id);
          }
        }
      }
      */
    } catch (err: any) {
      console.error(`[process] DB write error: ${err.message}`);
    }

    // 5. Update record status
    await recordRepo.updateStatus(payload.recordId, "completed");
    console.log(`[process] Record ${payload.recordId} marked as completed`);

    /* MOVED TO DIGEST — todo enrichment
    if (result.todos.length > 0) {
      const pendingTodos = payload.userId
        ? await todoRepo.findPendingByUser(payload.userId)
        : await todoRepo.findPendingByDevice(payload.deviceId);
      const newTodos = pendingTodos.slice(-result.todos.length);
      if (newTodos.length > 0) {
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
          })
          .catch((err) => {
            console.warn("[process] Todo enrichment failed:", err.message);
          });
      }
    }
    */

    /* MOVED TO DIGEST — memory creation, soul update, profile update
    const today = new Date().toISOString().split("T")[0];
    const session = getSession(payload.deviceId);
    const memoryManager = session.memoryManager;

    memoryManager.maybeCreateMemory(payload.deviceId, payload.text, today, payload.userId).catch((e) => {
      console.warn("[process] Memory creation failed:", e.message);
    });

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
    */

    // 6. Append to daily diary
    const diaryLine = result.summary
      ? `[${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${result.summary}`
      : `[${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${payload.text.slice(0, 200)}`;
    const diaryNotebook = payload.notebook && payload.notebook !== "ai-self" ? payload.notebook : "default";
    console.log(`[process] Diary append: payload.notebook=${payload.notebook}, target=${diaryNotebook}`);
    appendToDiary(payload.deviceId, diaryNotebook, diaryLine, payload.userId).catch((e) => {
      console.warn("[process] Diary append failed:", e.message);
    });

    // 7. Cognitive layer: trigger digest
    const recordCount = payload.userId
      ? await recordRepo.countByUser(payload.userId)
      : 999;
    const isColdStart = recordCount < 20;
    if (shouldDigestImmediately(result, payload.text.length, isColdStart)) {
      digestRecords([payload.recordId], {
        deviceId: payload.deviceId,
        userId: payload.userId,
      }).catch((e) => {
        console.warn('[process] Digest failed:', e.message);
      });
    }
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

function shouldDigestImmediately(_result: ProcessResult, textLength: number, _isColdStart?: boolean): boolean {
  // 所有有实质内容的输入都立即 Digest，确保待办/意图能被及时提取
  return textLength > 2;
}
