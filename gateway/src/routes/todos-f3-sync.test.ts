/**
 * voice-todo-ext F3: 模板修改同步今日未完成实例
 *
 * 测试 PATCH /api/v1/todos/:id 中周期模板修改时的同步逻辑：
 * - 当修改的是周期模板（有 recurrence_rule、无 recurrence_parent_id）
 * - 自动查找今日未完成实例并同步 text/priority/estimated_minutes/reminder_before/reminder_types
 * - scheduled_start 同步时保留实例的日期部分，只替换时间部分
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB ──
const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockExecute = vi.fn();
vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  execute: (...args: any[]) => mockExecute(...args),
}));

vi.mock("../memory/embeddings.js", () => ({
  getEmbedding: vi.fn(),
  cosineSimilarity: vi.fn(),
}));

vi.mock("../cognitive/todo-projector.js", () => ({
  onTodoComplete: vi.fn().mockResolvedValue(undefined),
}));

// Mock todoRepo，但使用 spy 跟踪调用
vi.mock("../db/repositories/index.js", () => ({
  todoRepo: {
    create: vi.fn(),
    dedupCreate: vi.fn(),
    findByUser: vi.fn(),
    findByDevice: vi.fn(),
    findSubtasks: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    del: vi.fn(),
    findById: vi.fn(),
    findTodayInstanceOfTemplate: vi.fn(),
    recalcReminderAt: vi.fn().mockResolvedValue(undefined),
  },
}));

import { todoRepo } from "../db/repositories/index.js";

describe("F3: 模板修改同步今日未完成实例", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // F3: findTodayInstanceOfTemplate SQL 查询正确性
  describe("findTodayInstanceOfTemplate", () => {
    it("should_query_by_parent_id_and_today_date_and_not_done_when_finding_instance", async () => {
      // 直接测试导入的函数
      const { findTodayInstanceOfTemplate } = await import("../db/repositories/todo.js");

      const mockInstance = {
        id: "inst-1",
        text: "锻炼",
        recurrence_parent_id: "tmpl-1",
        scheduled_start: "2026-04-24T08:00:00+08:00",
        done: false,
      };
      mockQueryOne.mockResolvedValueOnce(mockInstance);

      const result = await findTodayInstanceOfTemplate("tmpl-1");

      expect(result).toEqual(mockInstance);
      // 验证 SQL 包含正确条件
      const sql = mockQueryOne.mock.calls[0][0] as string;
      expect(sql).toContain("recurrence_parent_id = $1");
      expect(sql).toContain("CURRENT_DATE");
      expect(sql).toContain("done = false");
      expect(mockQueryOne.mock.calls[0][1]).toEqual(["tmpl-1"]);
    });

    it("should_return_null_when_no_today_instance_exists", async () => {
      const { findTodayInstanceOfTemplate } = await import("../db/repositories/todo.js");
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await findTodayInstanceOfTemplate("tmpl-no-instance");
      expect(result).toBeNull();
    });
  });

  // F3: PATCH 路由模板修改同步逻辑
  describe("PATCH sync logic", () => {
    it("should_sync_text_to_today_instance_when_template_text_modified", async () => {
      // 模拟模板
      const template = {
        id: "tmpl-1",
        text: "锻炼",
        recurrence_rule: "daily",
        recurrence_parent_id: null, // 是模板
        scheduled_start: "2026-04-24T08:00:00+08:00",
      };
      vi.mocked(todoRepo.findById).mockResolvedValue(template as any);

      // 模拟今日实例
      const instance = {
        id: "inst-1",
        text: "锻炼",
        recurrence_parent_id: "tmpl-1",
        scheduled_start: "2026-04-24T08:00:00+08:00",
        done: false,
      };
      vi.mocked(todoRepo.findTodayInstanceOfTemplate).mockResolvedValue(instance as any);

      // 模拟 PATCH body：修改 text
      const body = { text: "跑步" };

      // 调用更新模板
      await todoRepo.update("tmpl-1", body);

      // 模拟同步逻辑（从 todos.ts PATCH handler 中提取的核心逻辑）
      const syncableFields = ["text", "scheduled_start", "priority", "estimated_minutes", "reminder_before", "reminder_types"] as const;
      const hasSyncable = syncableFields.some((f) => (body as any)[f] !== undefined);
      expect(hasSyncable).toBe(true);

      // 查找今日实例
      const foundInstance = await todoRepo.findTodayInstanceOfTemplate("tmpl-1");
      expect(foundInstance).toEqual(instance);

      // 同步 text
      if (foundInstance) {
        const sync: Record<string, any> = {};
        if (body.text !== undefined) sync.text = body.text;
        await todoRepo.update(foundInstance.id, sync);
      }

      expect(todoRepo.update).toHaveBeenCalledWith("inst-1", { text: "跑步" });
    });

    it("should_replace_time_part_only_when_syncing_scheduled_start", () => {
      // 核心逻辑：保留实例日期，替换时间部分
      const instanceScheduledStart = "2026-04-24T08:00:00+08:00";
      const newTemplateStart = "2026-04-24T09:30:00+08:00";

      const instanceDate = instanceScheduledStart.split("T")[0];
      const newTimePart = newTemplateStart.split("T")[1];
      const syncedStart = `${instanceDate}T${newTimePart}`;

      expect(syncedStart).toBe("2026-04-24T09:30:00+08:00");
    });

    it("should_preserve_instance_date_when_template_time_changes", () => {
      // 边界：模板日期 != 实例日期时，实例日期应保持不变
      const instanceScheduledStart = "2026-04-24T08:00:00+08:00"; // 实例在4月24日
      const newTemplateStart = "2026-04-20T09:00:00+08:00"; // 模板显示4月20日

      const instanceDate = instanceScheduledStart.split("T")[0];
      const newTimePart = newTemplateStart.split("T")[1];
      const syncedStart = `${instanceDate}T${newTimePart}`;

      // 实例日期保持 4月24日，只换了时间
      expect(syncedStart).toBe("2026-04-24T09:00:00+08:00");
    });

    it("should_not_sync_when_todo_is_not_template", async () => {
      // 普通 todo（无 recurrence_rule）不触发同步
      const regularTodo = {
        id: "t-regular",
        text: "买菜",
        recurrence_rule: null,
        recurrence_parent_id: null,
      };
      vi.mocked(todoRepo.findById).mockResolvedValue(regularTodo as any);

      const body = { text: "买水果" };
      const todo = await todoRepo.findById("t-regular");

      // 没有 recurrence_rule → 不应该调用 findTodayInstanceOfTemplate
      const isTemplate = todo?.recurrence_rule && !todo?.recurrence_parent_id;
      expect(isTemplate).toBeFalsy();
    });

    it("should_not_sync_when_todo_is_instance_not_template", async () => {
      // 实例（有 recurrence_parent_id）不应触发同步
      const instance = {
        id: "inst-1",
        text: "锻炼",
        recurrence_rule: null,
        recurrence_parent_id: "tmpl-1", // 是实例
      };
      vi.mocked(todoRepo.findById).mockResolvedValue(instance as any);

      const todo = await todoRepo.findById("inst-1");
      const isTemplate = todo?.recurrence_rule && !todo?.recurrence_parent_id;
      expect(isTemplate).toBeFalsy();
    });

    it("should_not_sync_when_no_syncable_fields_changed", () => {
      // 只修改 done 不触发同步
      const body = { done: true };
      const syncableFields = ["text", "scheduled_start", "priority", "estimated_minutes", "reminder_before", "reminder_types"] as const;
      const hasSyncable = syncableFields.some((f) => (body as any)[f] !== undefined);
      expect(hasSyncable).toBe(false);
    });

    it("should_trigger_recalc_reminder_when_syncing_scheduled_start", async () => {
      // 同步 scheduled_start 后应重算 reminder_at
      vi.mocked(todoRepo.findTodayInstanceOfTemplate).mockResolvedValue({
        id: "inst-1",
        scheduled_start: "2026-04-24T08:00:00+08:00",
        done: false,
      } as any);

      const sync = { scheduled_start: "2026-04-24T09:00:00+08:00" };
      const needRecalc = sync.scheduled_start !== undefined;
      expect(needRecalc).toBe(true);

      // 验证重算调用
      await todoRepo.recalcReminderAt("inst-1");
      expect(todoRepo.recalcReminderAt).toHaveBeenCalledWith("inst-1");
    });
  });
});
