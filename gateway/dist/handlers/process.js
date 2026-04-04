import { chatCompletion } from "../ai/provider.js";
import { appendToDiary } from "../diary/manager.js";
import { recordRepo, summaryRepo, todoRepo, strikeRepo, bondRepo, strikeTagRepo } from "../db/repositories/index.js";
import { classifyVoiceIntent, executeVoiceAction } from "./voice-action.js";
import { safeParseJson } from "../lib/text-utils.js";
import { buildTodoExtractPrompt } from "./todo-extract-prompt.js";
import { buildUnifiedProcessPrompt } from "./unified-process-prompt.js";
import { projectIntendStrike } from "../cognitive/todo-projector.js";
// v2: CLEANUP_SYSTEM_PROMPT 不再单独使用 — 文本清理已合并到统一 prompt 中
/**
 * Process a single diary entry: clean transcript text, save summary, trigger digest.
 *
 * 三层路由（v2）：
 * Layer 1: sourceContext="todo" → 待办全能模式（不存日记、不 Digest）
 * Layer 2: forceCommand=true → 全量 Agent 模式（不存日记、不 Digest）
 * Layer 3: 其余 → AI 分类 + 存日记 + 条件 Digest
 */
export async function processEntry(payload) {
    const result = {};
    try {
        const t0 = Date.now();
        console.log(`[process] Starting for record ${payload.recordId}, text length: ${payload.text.length}, sourceContext: ${payload.sourceContext}, forceCommand: ${payload.forceCommand}`);
        // ── Layer 1: 待办全能模式 ─────────────────────────────────────
        if (payload.sourceContext === "todo") {
            console.log(`[process] Layer 1: Todo full mode`);
            result.voice_intent_type = "action";
            try {
                const todoResult = await todoFullMode(payload);
                result.todo_commands = todoResult.commands;
                result.action_results = todoResult.actionResults;
            }
            catch (err) {
                console.error(`[process] Layer 1 failed, returning error: ${err.message}`);
                result.error = `待办识别失败: ${err.message}`;
            }
            await recordRepo.updateStatus(payload.recordId, "completed");
            console.log(`[process][⏱ layer1-total] ${Date.now() - t0}ms`);
            return result;
        }
        // ── Layer 2: 全量 Agent 模式（上滑手势） ──────────────────────
        if (payload.forceCommand) {
            console.log(`[process] Layer 2: Agent command mode`);
            result.voice_intent_type = "action";
            try {
                // 全部走 AI 意图分类 + 执行（forceCommand=true 跳过正则预筛）
                const intentResult = await classifyVoiceIntent(payload.text, true);
                if (intentResult.actions.length > 0) {
                    const actionResults = await Promise.all(intentResult.actions.map((action) => executeVoiceAction(action, {
                        userId: payload.userId,
                        deviceId: payload.deviceId,
                        recordId: payload.recordId,
                    })));
                    result.action_results = actionResults;
                }
            }
            catch (err) {
                console.error(`[process] Layer 2 failed: ${err.message}`);
                result.error = `指令执行失败: ${err.message}`;
            }
            await recordRepo.updateStatus(payload.recordId, "completed");
            console.log(`[process][⏱ layer2-total] ${Date.now() - t0}ms`);
            return result;
        }
        // ── Layer 3: 统一 AI 调用（分类+清理+拆解+归类 一次完成）──────
        // v2: 不再分 3 步串行调用，让模型全权判断是否拆解、如何归类
        console.log(`[process] Layer 3: Unified AI processing`);
        // 1. 加载上下文
        const [pendingTodosL3, activeGoalsL3] = await Promise.all([
            payload.userId
                ? todoRepo.findPendingByUser(payload.userId)
                : todoRepo.findPendingByDevice(payload.deviceId),
            payload.userId
                ? todoRepo.findActiveGoalsByUser(payload.userId)
                : todoRepo.findActiveGoalsByDevice(payload.deviceId),
        ]);
        const unifiedCtx = {
            activeGoals: activeGoalsL3.slice(0, 20).map(g => ({ id: g.id, title: g.text })),
            pendingTodos: pendingTodosL3.slice(0, 20).map(t => ({
                id: t.id,
                text: t.text,
                scheduled_start: t.scheduled_start ?? undefined,
            })),
        };
        // 2. 单次 AI 调用
        const unifiedPrompt = buildUnifiedProcessPrompt(unifiedCtx);
        const messages = [
            { role: "system", content: unifiedPrompt },
            { role: "user", content: payload.text },
        ];
        const dynamicTimeout = Math.min(300_000, 60_000 + Math.floor(payload.text.length / 1000) * 20_000);
        const tUnified = Date.now();
        const response = await chatCompletion(messages, {
            json: true,
            temperature: 0.3,
            timeout: dynamicTimeout,
            tier: "fast",
        });
        console.log(`[process][⏱ unified-ai] ${Date.now() - tUnified}ms`);
        if (!response?.content?.trim()) {
            throw new Error("AI 返回空结果");
        }
        const parsed = safeParseJson(response.content);
        if (!parsed) {
            throw new Error("AI 返回格式错误");
        }
        const intentType = parsed.intent_type ?? "record";
        result.voice_intent_type = intentType;
        result.summary = parsed.summary;
        console.log(`[process] Unified result: intent=${intentType}, strikes=${parsed.strikes?.length ?? 0}, commands=${parsed.commands?.length ?? 0}, reason="${parsed.decomposition_reason ?? ""}"`);
        // 4. 保存 summary
        if (result.summary) {
            try {
                const existing = await summaryRepo.findByRecordId(payload.recordId);
                if (existing) {
                    await summaryRepo.update(payload.recordId, { short_summary: result.summary });
                }
                else {
                    await summaryRepo.create({
                        record_id: payload.recordId,
                        title: result.summary.slice(0, 50),
                        short_summary: result.summary,
                    });
                }
            }
            catch (err) {
                console.warn(`[process] Summary save failed: ${err.message}`);
            }
        }
        // 5. 处理指令（action/mixed 时）
        // 记录 create_todo 命令，避免 intend strike 投影时重复创建
        const hasCreateTodoCommand = new Set();
        if ((intentType === "action" || intentType === "mixed") && parsed.commands && parsed.commands.length > 0) {
            for (const cmd of parsed.commands) {
                if (cmd.action_type === "create_todo") {
                    hasCreateTodoCommand.add("create_todo");
                }
            }
            // 将统一结果中的 commands 转为 voice-action 执行
            const actionResults = [];
            for (const cmd of parsed.commands) {
                try {
                    const actionResult = await executeVoiceAction({
                        type: cmd.action_type,
                        confidence: cmd.confidence,
                        target_hint: cmd.target_hint ?? "",
                        changes: cmd.changes,
                        risk_level: "low",
                        original_text: payload.text,
                    }, {
                        userId: payload.userId,
                        deviceId: payload.deviceId,
                        recordId: payload.recordId,
                    });
                    actionResults.push(actionResult);
                }
                catch (err) {
                    console.warn(`[process] Command execution failed: ${err.message}`);
                }
            }
            result.action_results = actionResults;
            // 也转为 todo_commands 格式，供 CommandSheet 显示
            result.todo_commands = parsed.commands.map(cmd => ({
                action_type: cmd.action_type,
                confidence: cmd.confidence,
                target_hint: cmd.target_hint,
                target_id: cmd.target_id,
                changes: cmd.changes,
            }));
        }
        // 6. 写入 Strikes + Bonds（直接写 DB，跳过 digest.ts 管道）
        // 统一调用已经完成了 AI 拆解，不需要再调 digestRecords
        if (parsed.strikes && parsed.strikes.length > 0) {
            const uid = payload.userId;
            const strikeIds = [];
            for (const s of parsed.strikes) {
                try {
                    // 去重：同 source_id + 同 nucleus 不重复创建
                    if (uid) {
                        const exists = await strikeRepo.existsBySourceAndNucleus(payload.recordId, s.nucleus);
                        if (exists) {
                            console.log(`[process] Strike dedup: "${s.nucleus.slice(0, 30)}" already exists`);
                            continue;
                        }
                    }
                    // 将 AI 输出的 goal_id 合并到 field 中，保持 Strike 表结构不变
                    // goal_id 存在 field.matched_goal_id 中，供后续查询和关联使用
                    const strikeField = { ...(s.field ?? {}) };
                    if (s.goal_id) {
                        strikeField.matched_goal_id = s.goal_id;
                    }
                    const strike = await strikeRepo.create({
                        source_id: payload.recordId,
                        user_id: uid ?? payload.deviceId,
                        nucleus: s.nucleus,
                        polarity: s.polarity,
                        salience: s.confidence,
                        confidence: s.confidence,
                        field: Object.keys(strikeField).length > 0 ? strikeField : undefined,
                    });
                    strikeIds.push(strike.id);
                    // 写标签
                    if (s.tags && s.tags.length > 0) {
                        await strikeTagRepo.createMany(s.tags.map(label => ({ strike_id: strike.id, label })));
                    }
                    // intend 类型 → 投影为 todo/goal
                    // 如果 commands 已包含 create_todo，跳过投影避免重复创建
                    if (s.polarity === "intend" && !hasCreateTodoCommand.has("create_todo")) {
                        projectIntendStrike(strike, uid).catch(err => console.warn(`[process] Todo projection failed: ${err.message}`));
                    }
                    // 非 intend 类型 + 有 goal_id → 创建 Strike 与目标的关联 Bond
                    // 这让非待办类的认知（perceive/judge/realize）也能挂靠到目标下
                    if (s.polarity !== "intend" && s.goal_id) {
                        try {
                            // 找到目标对应的 cluster_id（目标在 todo 表中，cluster_id 指向聚类 Strike）
                            const goal = await todoRepo.findById(s.goal_id);
                            if (goal?.cluster_id) {
                                await bondRepo.create({
                                    source_strike_id: strike.id,
                                    target_strike_id: goal.cluster_id,
                                    type: "context_of",
                                    strength: 0.7,
                                });
                            }
                        }
                        catch {
                            // goal 查找失败不阻塞
                        }
                    }
                }
                catch (err) {
                    console.warn(`[process] Strike write failed: ${err.message}`);
                }
            }
            // 写 Bonds
            if (parsed.bonds && parsed.bonds.length > 0 && strikeIds.length >= 2) {
                for (const b of parsed.bonds) {
                    const sourceId = strikeIds[b.source_idx];
                    const targetId = strikeIds[b.target_idx];
                    if (sourceId && targetId) {
                        try {
                            await bondRepo.create({
                                source_strike_id: sourceId,
                                target_strike_id: targetId,
                                type: b.type,
                                strength: b.strength,
                            });
                        }
                        catch (err) {
                            console.warn(`[process] Bond write failed: ${err.message}`);
                        }
                    }
                }
            }
            // 标记 record 已消化（不再需要 digest.ts 二次处理）
            try {
                await recordRepo.claimForDigest([payload.recordId]);
            }
            catch {
                // 可能已被 claim，忽略
            }
        }
        // 7. Update record status
        await recordRepo.updateStatus(payload.recordId, "completed");
        // 8. Append to daily diary
        const diaryLine = result.summary
            ? `[${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${result.summary}`
            : `[${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${payload.text.slice(0, 200)}`;
        const diaryNotebook = payload.notebook && payload.notebook !== "ai-self" ? payload.notebook : "default";
        appendToDiary(payload.deviceId, diaryNotebook, diaryLine, payload.userId).catch((e) => {
            console.warn("[process] Diary append failed:", e.message);
        });
    }
    catch (err) {
        console.error(`[process] Fatal error processing record ${payload.recordId}:`, err);
        try {
            await recordRepo.updateStatus(payload.recordId, "error");
        }
        catch {
            console.error("[process] Also failed to update record status to error");
        }
        result.error = err.message;
    }
    return result;
}
// v2: shouldDigestImmediately 不再需要 — Layer 3 统一调用已直接写入 Strikes，
// 不再触发 digest.ts 管道。Tier2 batch-analyze 仍由 daily-cycle/proactive 触发。
// ── Layer 1: 待办全能模式 ─────────────────────────────────────────
async function todoFullMode(payload) {
    // 1. 加载上下文：用户未完成待办 + 活跃目标
    const [pendingTodos, activeGoals] = await Promise.all([
        payload.userId
            ? todoRepo.findPendingByUser(payload.userId)
            : todoRepo.findPendingByDevice(payload.deviceId),
        payload.userId
            ? todoRepo.findActiveGoalsByUser(payload.userId)
            : todoRepo.findActiveGoalsByDevice(payload.deviceId),
    ]);
    const ctx = {
        pendingTodos: pendingTodos.slice(0, 30).map(t => ({
            id: t.id,
            text: t.text,
            scheduled_start: t.scheduled_start ?? undefined,
        })),
        activeGoals: activeGoals.slice(0, 20).map(g => ({
            id: g.id,
            title: g.text,
        })),
    };
    // 2. AI 提取
    const prompt = buildTodoExtractPrompt(ctx);
    const messages = [
        { role: "system", content: prompt },
        { role: "user", content: payload.text },
    ];
    const t1 = Date.now();
    const response = await chatCompletion(messages, {
        json: true,
        temperature: 0.2,
        timeout: 15000,
        tier: "fast",
    });
    console.log(`[process][⏱ todo-extract-ai] ${Date.now() - t1}ms`);
    if (!response?.content) {
        throw new Error("AI 返回空结果");
    }
    const parsed = safeParseJson(response.content);
    if (!parsed?.commands || !Array.isArray(parsed.commands)) {
        throw new Error("AI 返回格式错误");
    }
    const commands = parsed.commands;
    const actionResults = [];
    // 3. 处理 query 类型：后端查询填充结果
    for (const cmd of commands) {
        if (cmd.action_type === "query" && cmd.query_params) {
            const todos = payload.userId
                ? await todoRepo.findPendingByUser(payload.userId)
                : await todoRepo.findPendingByDevice(payload.deviceId);
            let filtered = todos;
            // 按日期过滤
            if (cmd.query_params.date) {
                filtered = filtered.filter(t => {
                    if (!t.scheduled_start)
                        return false;
                    return t.scheduled_start.startsWith(cmd.query_params.date);
                });
            }
            // 按目标过滤
            if (cmd.query_params.goal_id) {
                filtered = filtered.filter(t => t.goal_id === cmd.query_params.goal_id);
            }
            // 按状态过滤
            if (cmd.query_params.status === "done") {
                const allTodos = payload.userId
                    ? await todoRepo.findByUser(payload.userId)
                    : await todoRepo.findByDevice(payload.deviceId);
                filtered = allTodos.filter(t => t.done);
            }
            cmd.query_result = filtered.slice(0, 10).map(t => ({
                id: t.id,
                text: t.text,
                scheduled_start: t.scheduled_start ?? undefined,
                done: t.done,
                priority: t.priority,
            }));
        }
        // 处理 complete/modify 的 target_id 匹配
        if ((cmd.action_type === "complete" || cmd.action_type === "modify") && cmd.target_hint && !cmd.target_id) {
            // 从待办列表中模糊匹配
            const match = pendingTodos.find(t => t.text.includes(cmd.target_hint) ||
                cmd.target_hint.split("").some(char => t.text.includes(char)));
            if (match) {
                cmd.target_id = match.id;
            }
        }
        // 为 goal_hint 匹配实际 goal_id（create 时用）
        if (cmd.action_type === "create" && cmd.todo?.goal_hint) {
            const matchedGoal = activeGoals.find(g => g.text === cmd.todo.goal_hint || g.text.includes(cmd.todo.goal_hint));
            if (matchedGoal) {
                cmd.todo._matched_goal_id = matchedGoal.id;
            }
        }
    }
    return { commands, actionResults };
}
//# sourceMappingURL=process.js.map