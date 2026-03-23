import { strikeRepo, bondRepo } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
// ── Step 5: keyword-based duration classification ──
const QUICK_RE = /打电话|发消息|确认|回复|发送|转发|通知|提醒|call|reply|send|confirm/i;
const DEEP_RE = /写|做|分析|学习|研究|设计|开发|整理|规划|write|analyze|study|design|develop|plan/i;
function classifyDuration(text) {
    if (QUICK_RE.test(text))
        return "quick";
    if (DEEP_RE.test(text))
        return "deep";
    return "medium";
}
// ── Step 5: keyword-based action type classification ──
const CALL_RE = /打电话|通话|call|phone/i;
const WRITE_RE = /写|编写|草拟|write|draft|compose/i;
const REVIEW_RE = /审|检查|review|check|verify/i;
const RECORD_RE = /记录|record|log|note/i;
function classifyActionType(text) {
    if (CALL_RE.test(text))
        return "call";
    if (WRITE_RE.test(text))
        return "write";
    if (REVIEW_RE.test(text))
        return "review";
    if (RECORD_RE.test(text))
        return "record";
    return "think";
}
export async function computeActionPanel(userId) {
    // ── Step 1: find active goal-level strikes ──
    const goalStrikes = await strikeRepo.findByUser(userId, {
        status: "active",
        polarity: "intend",
        limit: 5,
    });
    if (goalStrikes.length === 0) {
        return { now: null, today: [], goals: [] };
    }
    // Sort by salience descending (findByUser sorts by created_at)
    goalStrikes.sort((a, b) => b.salience - a.salience);
    // ── Step 2: find actions for each goal ──
    const goalStrikeIds = new Set(goalStrikes.map((s) => s.id));
    const allActions = [];
    const goalActionCounts = new Map();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    for (const goal of goalStrikes) {
        let count = 0;
        // 2a: find action strikes via bonds
        const bonds = await bondRepo.findByStrike(goal.id);
        const linkedIds = bonds.map((b) => b.source_strike_id === goal.id ? b.target_strike_id : b.source_strike_id);
        if (linkedIds.length > 0) {
            const placeholders = linkedIds.map((_, i) => `$${i + 1}`).join(", ");
            const linkedStrikes = await query(`SELECT * FROM strike WHERE id IN (${placeholders})
         AND polarity = 'intend' AND status = 'active'`, linkedIds);
            for (const s of linkedStrikes) {
                if (goalStrikeIds.has(s.id))
                    continue; // skip goal-level strikes
                allActions.push({
                    strikeId: s.id,
                    text: s.nucleus,
                    goalId: goal.id,
                    goalName: goal.nucleus,
                    scheduledStart: s.field?.scheduled_start ?? null,
                    deadline: s.field?.deadline ?? null,
                    salience: s.salience,
                    field: s.field ?? {},
                    source: "strike",
                });
                count++;
            }
        }
        // 2b: find todos linked to this goal (via goal_id)
        const todos = await query(`SELECT * FROM todo WHERE goal_id = $1 AND done = false ORDER BY priority DESC`, [goal.id]);
        for (const t of todos) {
            allActions.push({
                strikeId: t.id,
                text: t.text,
                goalId: goal.id,
                goalName: goal.nucleus,
                scheduledStart: t.scheduled_start,
                deadline: t.scheduled_end,
                salience: t.priority / 5, // normalize 1-5 → 0.2-1.0
                field: t.relay_meta ? { relay_meta: t.relay_meta } : {},
                source: "todo",
            });
            count++;
        }
        goalActionCounts.set(goal.id, count);
    }
    // ── Step 3: sort actions ──
    const nowStr = new Date().toISOString();
    allActions.sort((a, b) => {
        const aScheduledToday = a.scheduledStart &&
            a.scheduledStart >= todayStart.toISOString() &&
            a.scheduledStart <= todayEnd.toISOString();
        const bScheduledToday = b.scheduledStart &&
            b.scheduledStart >= todayStart.toISOString() &&
            b.scheduledStart <= todayEnd.toISOString();
        // Scheduled today → highest
        if (aScheduledToday && !bScheduledToday)
            return -1;
        if (!aScheduledToday && bScheduledToday)
            return 1;
        // Has approaching deadline → next
        const aDeadlineSoon = a.deadline && a.deadline <= todayEnd.toISOString();
        const bDeadlineSoon = b.deadline && b.deadline <= todayEnd.toISOString();
        if (aDeadlineSoon && !bDeadlineSoon)
            return -1;
        if (!aDeadlineSoon && bDeadlineSoon)
            return 1;
        // Otherwise by salience
        return b.salience - a.salience;
    });
    // ── Step 4: assemble panel ──
    const top = allActions[0] ?? null;
    let now = null;
    if (top) {
        now = {
            strikeId: top.strikeId,
            goalName: top.goalName,
            action: top.text,
            context: top.field?.relay_meta?.context ?? undefined,
            actionType: classifyActionType(top.text),
            targetPerson: top.field?.relay_meta?.target_person ?? undefined,
            durationEstimate: classifyDuration(top.text),
            goalId: top.goalId,
        };
    }
    const today = allActions.slice(1, 5).map((a) => {
        let symbol = "flexible";
        if (a.scheduledStart &&
            a.scheduledStart >= todayStart.toISOString() &&
            a.scheduledStart <= todayEnd.toISOString()) {
            symbol = "scheduled";
        }
        else if (a.deadline && a.deadline <= todayEnd.toISOString()) {
            symbol = "next";
        }
        return {
            strikeId: a.strikeId,
            text: a.text,
            goalName: a.goalName,
            symbol,
            scheduledTime: a.scheduledStart ?? undefined,
        };
    });
    const goals = goalStrikes.map((g) => ({
        goalId: g.id,
        goalName: g.nucleus,
        actionCount: goalActionCounts.get(g.id) ?? 0,
    }));
    console.log(`[action-panel] user=${userId} now=${now ? "yes" : "empty"} today=${today.length} goals=${goals.length}`);
    return { now, today, goals };
}
//# sourceMappingURL=action-panel.js.map