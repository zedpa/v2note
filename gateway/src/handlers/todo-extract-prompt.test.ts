/**
 * voice-todo-ext F5: 停止周期的语音命令
 * 测试 buildTodoExtractPrompt 输出包含停止周期规则（规则 9）
 */
import { describe, it, expect } from "vitest";
import { buildTodoExtractPrompt, type TodoModeContext } from "./todo-extract-prompt.js";

const baseCtx: TodoModeContext = {
  pendingTodos: [
    { id: "todo-1", text: "锻炼", scheduled_start: "2026-04-04T08:00:00" },
  ],
  activeGoals: [],
};

describe("F5: 停止周期语音命令 — buildTodoExtractPrompt", () => {
  it("should_include_stop_recurrence_rule_when_building_prompt", () => {
    const prompt = buildTodoExtractPrompt(baseCtx);
    // 规则 9 应该存在
    expect(prompt).toContain("停止周期任务");
  });

  it("should_instruct_modify_action_with_recurrence_end_date_when_stopping_recurrence", () => {
    const prompt = buildTodoExtractPrompt(baseCtx);
    // 指导 AI 使用 modify + recurrence.end_date
    expect(prompt).toContain("action_type");
    expect(prompt).toContain("modify");
    expect(prompt).toContain("end_date");
  });

  it("should_include_stop_recurrence_example_phrases_when_building_prompt", () => {
    const prompt = buildTodoExtractPrompt(baseCtx);
    // 应包含示例短语，帮助 AI 识别停止意图
    expect(prompt).toMatch(/不用.*提醒|取消.*打卡|不用再/);
  });

  it("should_use_modify_not_delete_for_stop_recurrence_when_building_prompt", () => {
    const prompt = buildTodoExtractPrompt(baseCtx);
    // 确保停止周期使用 modify 而非 delete，保留历史记录
    const stopSection = prompt.slice(
      prompt.indexOf("停止周期"),
      prompt.indexOf("\n\n", prompt.indexOf("停止周期")) + 1,
    );
    expect(stopSection).toContain("modify");
    expect(stopSection).not.toContain("delete");
  });

  it("should_include_recurrence_end_date_in_changes_example_when_building_prompt", () => {
    const prompt = buildTodoExtractPrompt(baseCtx);
    // changes 中应有 recurrence.end_date 示例
    expect(prompt).toContain("recurrence");
    expect(prompt).toContain("end_date");
  });
});
