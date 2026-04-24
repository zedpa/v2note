import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { todoRepo } from "../db/repositories/index.js";
import { onTodoComplete } from "../cognitive/todo-projector.js";
import { today, toLocalDate } from "../lib/tz.js";

/** 裸时间字符串补上 +08:00（防御无时区的 ISO 输入） */
function ensureTz(ts: string | undefined | null): string | undefined | null {
  if (ts === undefined || ts === null) return ts;
  if (/[+-]\d{2}:\d{2}$/.test(ts) || /Z$/i.test(ts)) return ts;
  return `${ts}+08:00`;
}

export function registerTodoRoutes(router: Router) {
  // List todos
  router.get("/api/v1/todos", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }
    const todos = await todoRepo.findByUser(userId);
    sendJson(res, todos);
  });

  // Create todo（支持无 record_id 的手动创建）
  router.post("/api/v1/todos", async (_req, res) => {
    const body = await readBody<{
      record_id?: string;
      text: string;
      impact?: number;
      goal_id?: string;
      scheduled_start?: string;
      estimated_minutes?: number;
      parent_id?: string;
      level?: number;
      status?: string;
      priority?: number;
      reminder_before?: number | null;
      reminder_types?: string[] | null;
      recurrence_rule?: string | null;
      recurrence_end?: string | null;
    }>(_req);
    const userId = getUserId(_req) ?? undefined;
    if (!userId) { sendError(res, "Unauthorized", 401); return; }

    // 计算 reminder_at：reminder_before（分钟）+ scheduled_start → 自动推算
    let reminder_at: string | undefined;
    if (body.reminder_before && body.reminder_before > 0 && body.scheduled_start) {
      reminder_at = new Date(
        new Date(body.scheduled_start).getTime() - body.reminder_before * 60000,
      ).toISOString();
    }

    const shared = {
      record_id: body.record_id || null,
      text: body.text,
      impact: body.impact,
      goal_id: body.goal_id,
      scheduled_start: ensureTz(body.scheduled_start) ?? undefined,
      estimated_minutes: body.estimated_minutes,
      parent_id: body.parent_id,
      level: body.level,
      status: body.status,
      priority: body.priority,
      reminder_at,
      reminder_before: body.reminder_before ?? undefined,
      reminder_types: body.reminder_types ?? undefined,
      recurrence_rule: body.recurrence_rule ?? undefined,
      recurrence_end: body.recurrence_end ?? undefined,
      user_id: userId,
      device_id: undefined,
    };

    // level=0 走去重，level>=1 走 create
    const isGoal = (body.level ?? 0) >= 1;
    if (isGoal) {
      const todo = await todoRepo.create(shared);
      sendJson(res, { id: todo.id }, 201);
    } else {
      const { todo, action } = await todoRepo.dedupCreate(shared);
      sendJson(res, { id: todo.id, deduplicated: action === "matched" }, action === "matched" ? 200 : 201);
    }
  });

  // Get subtasks of a todo
  router.get("/api/v1/todos/:id/subtasks", async (_req, res, params) => {
    const subtasks = await todoRepo.findSubtasks(params.id);
    sendJson(res, subtasks);
  });

  // Update todo
  router.patch("/api/v1/todos/:id", async (req, res, params) => {
    const body = await readBody<{
      text?: string;
      done?: boolean;
      scheduled_start?: string | null;
      scheduled_end?: string | null;
      estimated_minutes?: number | null;
      priority?: number;
      level?: number;
      status?: string;
      reminder_before?: number | null;
      reminder_types?: string[] | null;
      recurrence_rule?: string | null;
      recurrence_end?: string | null;
    }>(req);

    // 裸时间防御
    if (body.scheduled_start) body.scheduled_start = ensureTz(body.scheduled_start) as string;
    if (body.scheduled_end) body.scheduled_end = ensureTz(body.scheduled_end) as string;

    // 计算 reminder_at
    const updateFields: Record<string, any> = { ...body };
    if (body.reminder_before === null) {
      // 清除提醒
      updateFields.reminder_at = null;
      updateFields.reminder_types = null;
    } else if (body.reminder_before && body.reminder_before > 0 && body.scheduled_start) {
      // 同时传 reminder_before + scheduled_start → 重算
      updateFields.reminder_at = new Date(
        new Date(body.scheduled_start).getTime() - body.reminder_before * 60000,
      ).toISOString();
    }

    await todoRepo.update(params.id, updateFields);
    // scheduled_start 变更时重算 reminder_at（处理只改时间未传 reminder_before 的场景）
    if (body.scheduled_start !== undefined && body.reminder_before === undefined) {
      await todoRepo.recalcReminderAt(params.id);
    }
    // todo 完成时触发双向一致性：降低 Strike salience
    if (body.done === true) {
      onTodoComplete(params.id).catch((e) =>
        console.error("[todos] onTodoComplete failed:", e),
      );
    }

    // F3: 周期模板修改 → 同步今日未完成实例（失败不影响主更新）
    const syncableFields = ["text", "scheduled_start", "priority", "estimated_minutes", "reminder_before", "reminder_types"] as const;
    const hasSyncable = syncableFields.some((f) => (body as any)[f] !== undefined);
    if (hasSyncable) {
      try {
        const todo = await todoRepo.findById(params.id);
        if (todo?.recurrence_rule && !todo.recurrence_parent_id) {
          const instance = await todoRepo.findTodayInstanceOfTemplate(params.id);
          if (instance) {
            const sync: Record<string, any> = {};
            if (body.text !== undefined) sync.text = body.text;
            if (body.priority !== undefined) sync.priority = body.priority;
            if (body.estimated_minutes !== undefined) sync.estimated_minutes = body.estimated_minutes;
            if (body.reminder_before !== undefined) sync.reminder_before = body.reminder_before;
            if (body.reminder_types !== undefined) sync.reminder_types = body.reminder_types;
            // 时间：保留实例日期，替换时间部分
            if (body.scheduled_start) {
              const instanceDate = instance.scheduled_start
                ? toLocalDate(instance.scheduled_start)
                : today();
              const newTimePart = body.scheduled_start.split("T")[1];
              if (newTimePart) sync.scheduled_start = `${instanceDate}T${newTimePart}`;
            }
            if (Object.keys(sync).length > 0) {
              await todoRepo.update(instance.id, sync);
              if (sync.scheduled_start || sync.reminder_before !== undefined) {
                await todoRepo.recalcReminderAt(instance.id);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[todos] F3 recurrence sync failed:", e);
      }
    }

    sendJson(res, { ok: true });
  });

  // Delete todo
  router.delete("/api/v1/todos/:id", async (_req, res, params) => {
    await todoRepo.del(params.id);
    sendJson(res, { ok: true });
  });
}
