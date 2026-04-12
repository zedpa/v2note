import type { TimeSlot } from "./time-slots";

/**
 * 待办 DTO — 后端 API 返回的完整字段，前端直接使用不手动映射
 */
export interface TodoDTO {
  id: string;
  text: string;
  done: boolean;
  record_id: string | null;
  created_at: string;
  updated_at?: string;

  // 调度
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_minutes: number | null;
  priority: number | null;

  // 提醒
  reminder_at: string | null;       // 后端计算的绝对提醒时间（ISO 8601 UTC）
  reminder_before: number | null;   // 用户设定的提前分钟数
  reminder_types: string[] | null;  // ['notification','alarm','calendar'] 可多选

  // 领域 & 影响
  domain: string | null;
  impact: number | null;

  // AI
  ai_actionable: boolean;
  ai_action_plan: string[] | null;

  // 层级
  level: number;          // 0=行动, 1=目标, 2=项目
  parent_id: string | null;
  cluster_id: string | null;
  /** wiki page 关联 ID（认知 Wiki 模式） */
  wiki_page_id?: string | null;
  status: string;         // active|progressing|blocked|paused|completed|...
  goal_id: string | null; // deprecated

  // 计算字段（后端 JOIN）
  subtask_count: number;
  subtask_done_count: number;
  goal_title: string | null;

  // 兼容旧字段
  source?: string | null;
  category?: string | null;
}

/**
 * 项目分组（含"其他"虚拟分组）
 */
export interface ProjectGroup {
  project: TodoDTO | null;  // null = "其他"虚拟分组
  tasks: TodoDTO[];
  pendingCount: number;
  doneCount: number;
  isInbox: boolean;
}

/**
 * 时段分组
 */
export interface TimeSlotGroup {
  slot: TimeSlot;
  pending: TodoDTO[];
  completed: TodoDTO[];
}
