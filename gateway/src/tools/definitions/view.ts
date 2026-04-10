import { z } from "zod";
import {
  recordRepo,
  transcriptRepo,
  summaryRepo,
  todoRepo,
  goalRepo,
  memoryRepo,
  userProfileRepo,
  soulRepo,
  skillConfigRepo,
} from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";
import { toLocalDateTime } from "../../lib/tz.js";

const MAX_CONTENT_LENGTH = 5000;
const MAX_TODOS_PER_GOAL = 20;

type ViewType = "record" | "todo" | "goal" | "memory" | "profile" | "soul" | "config";
const TYPES_REQUIRING_ID: ViewType[] = ["record", "todo", "goal", "memory"];

export const viewTool: ToolDefinition = {
  name: "view",
  description: `查看用户范围内任何实体的完整详情。
使用：search 返回摘要后需要看详情（"帮我看看那条日记"、"这个待办的子任务"）。
使用：需要了解用户画像/认知摘要/配置（"我的个人信息"、"你对我的了解"）。
不用：要列出或搜索内容 → 用 search。
不用：要修改内容 → 用对应的 update 工具。`,
  parameters: z.object({
    type: z.enum(["record", "todo", "goal", "memory", "profile", "soul", "config"])
      .describe("查看的实体类型"),
    id: z.string().optional()
      .describe("实体 ID（record/todo/goal/memory 必填，profile/soul/config 不需要）"),
  }),
  autonomy: "silent",
  handler: async (args, ctx) => {
    if (!ctx.userId) {
      return { success: false, message: "登录已过期，请重新登录" };
    }

    const viewType = args.type as ViewType;

    // 需要 id 的类型校验
    if (TYPES_REQUIRING_ID.includes(viewType) && !args.id) {
      return { success: false, message: `查看 ${viewType} 需要提供 id 参数` };
    }

    switch (viewType) {
      case "record":
        return viewRecord(args.id!, ctx.userId);
      case "todo":
        return viewTodo(args.id!, ctx.userId);
      case "goal":
        return viewGoal(args.id!, ctx.userId);
      case "memory":
        return viewMemory(args.id!, ctx.userId);
      case "profile":
        return viewProfile(ctx.userId);
      case "soul":
        return viewSoul(ctx.userId);
      case "config":
        return viewConfig(ctx.userId);
      default:
        return { success: false, message: `不支持的类型: ${viewType}` };
    }
  },
};

// ── record ──────────────────────────────────────────────────────────────────

async function viewRecord(id: string, userId: string) {
  const record = await recordRepo.findById(id);
  if (!record || record.user_id !== userId) {
    return { success: false, message: "内容不存在或无权访问" };
  }

  const [transcript, summary] = await Promise.all([
    transcriptRepo.findByRecordId(id),
    summaryRepo.findByRecordId(id),
  ]);

  const fullContent = transcript?.text ?? "";
  const truncated = fullContent.length > MAX_CONTENT_LENGTH;
  const content = truncated ? fullContent.slice(0, MAX_CONTENT_LENGTH) : fullContent;

  return {
    success: true,
    message: truncated
      ? `日记内容已截断，共 ${fullContent.length} 字`
      : `日记内容，共 ${fullContent.length} 字`,
    data: {
      type: "record",
      record_id: record.id,
      title: summary?.title ?? null,
      content,
      domain: record.domain ?? null,
      source: record.source,
      created_at: toLocalDateTime(record.created_at),
      word_count: fullContent.length,
      truncated,
    },
  };
}

// ── todo ────────────────────────────────────────────────────────────────────

async function viewTodo(id: string, userId: string) {
  const todo = await todoRepo.findById(id);
  if (!todo || todo.user_id !== userId) {
    return { success: false, message: "内容不存在或无权访问" };
  }

  const subtasks = await todoRepo.findSubtasks(id);

  return {
    success: true,
    message: `待办: "${todo.text}"`,
    data: {
      type: "todo",
      todo_id: todo.id,
      text: todo.text,
      done: todo.done,
      priority: todo.priority,
      scheduled_start: todo.scheduled_start ? toLocalDateTime(todo.scheduled_start) : null,
      scheduled_end: todo.scheduled_end ? toLocalDateTime(todo.scheduled_end) : null,
      estimated_minutes: todo.estimated_minutes,
      parent_id: todo.parent_id,
      record_id: todo.record_id,
      subtasks: subtasks.map((s) => ({ id: s.id, text: s.text, done: s.done })),
      created_at: toLocalDateTime(todo.created_at),
    },
  };
}

// ── goal ────────────────────────────────────────────────────────────────────

async function viewGoal(id: string, userId: string) {
  const goal = await goalRepo.findById(id);
  if (!goal || goal.user_id !== userId) {
    return { success: false, message: "内容不存在或无权访问" };
  }

  const todos = await goalRepo.findWithTodos(id);
  const activeTodos = todos.filter((t) => !t.done);
  const completedTodos = todos.filter((t) => t.done);

  return {
    success: true,
    message: `目标: "${goal.title}"`,
    data: {
      type: "goal",
      goal_id: goal.id,
      title: goal.title,
      status: goal.status,
      parent_id: goal.parent_id,
      todo_stats: { active: activeTodos.length, completed: completedTodos.length },
      todos: todos.slice(0, MAX_TODOS_PER_GOAL).map((t) => ({
        id: t.id, text: t.text, done: t.done,
      })),
      created_at: toLocalDateTime(goal.created_at),
    },
  };
}

// ── memory ──────────────────────────────────────────────────────────────────

async function viewMemory(id: string, userId: string) {
  const memory = await memoryRepo.findById(id);
  if (!memory) {
    return { success: false, message: "内容不存在或无权访问" };
  }
  // 归属校验：user_id 匹配，旧数据 user_id=null 也拒绝（要求登录）
  if (memory.user_id !== userId) {
    return { success: false, message: "内容不存在或无权访问" };
  }

  const snippet = memory.content.length > 50
    ? memory.content.slice(0, 50) + "…"
    : memory.content;

  return {
    success: true,
    message: `记忆: ${snippet}`,
    data: {
      type: "memory",
      memory_id: memory.id,
      content: memory.content,
      importance: memory.importance,
      source_date: memory.source_date,
      created_at: toLocalDateTime(memory.created_at),
    },
  };
}

// ── profile ─────────────────────────────────────────────────────────────────

async function viewProfile(userId: string) {
  const profile = await userProfileRepo.findByUser(userId);
  if (!profile) {
    return {
      success: true,
      message: "尚未建立用户画像",
      data: {
        type: "profile",
        name: null,
        occupation: null,
        current_focus: null,
        pain_points: null,
        review_time: null,
        preferences: {},
        onboarding_done: false,
      },
    };
  }

  return {
    success: true,
    message: profile.name ? `用户: ${profile.name}` : "用户画像",
    data: {
      type: "profile",
      name: profile.name,
      occupation: profile.occupation,
      current_focus: profile.current_focus,
      pain_points: profile.pain_points,
      review_time: profile.review_time,
      preferences: profile.preferences ?? {},
      onboarding_done: profile.onboarding_done,
      timezone: profile.timezone ?? "Asia/Shanghai",
      updated_at: profile.updated_at,
    },
  };
}

// ── soul ────────────────────────────────────────────────────────────────────

async function viewSoul(userId: string) {
  const soul = await soulRepo.findByUser(userId);
  if (!soul) {
    return {
      success: true,
      message: "尚未建立认知摘要",
      data: { type: "soul", content: null },
    };
  }

  return {
    success: true,
    message: "用户认知摘要",
    data: {
      type: "soul",
      content: soul.content,
      updated_at: soul.updated_at,
    },
  };
}

// ── config ──────────────────────────────────────────────────────────────────

async function viewConfig(userId: string) {
  const configs = await skillConfigRepo.findByUser(userId);

  return {
    success: true,
    message: `共 ${configs.length} 项技能配置`,
    data: {
      type: "config",
      skills: configs.map((c) => ({
        skill_name: c.skill_name,
        enabled: c.enabled,
        config: c.config,
      })),
    },
  };
}
