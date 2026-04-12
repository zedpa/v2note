import { describe, it, expect } from "vitest";
import { buildCommandFullPrompt, type CommandFullContext } from "./command-full-prompt.js";

describe("buildCommandFullPrompt", () => {
  const baseCtx: CommandFullContext = {
    pendingTodos: [
      { id: "todo-1", text: "买牛奶", scheduled_start: "2026-04-11T09:00:00" },
      { id: "todo-2", text: "开产品评审会" },
    ],
    activeGoals: [
      { id: "goal-1", title: "健康管理" },
    ],
    wikiPages: [
      { id: "wp-1", title: "工作" },
      { id: "wp-2", title: "生活" },
    ],
  };

  it("should_include_pending_todos_when_context_has_todos", () => {
    const prompt = buildCommandFullPrompt(baseCtx);
    expect(prompt).toContain("[todo-1]");
    expect(prompt).toContain("买牛奶");
    expect(prompt).toContain("[todo-2]");
    expect(prompt).toContain("开产品评审会");
  });

  it("should_include_active_goals_when_context_has_goals", () => {
    const prompt = buildCommandFullPrompt(baseCtx);
    expect(prompt).toContain("[goal-1]");
    expect(prompt).toContain("健康管理");
  });

  it("should_include_wiki_pages_when_context_has_pages", () => {
    const prompt = buildCommandFullPrompt(baseCtx);
    expect(prompt).toContain("工作");
    expect(prompt).toContain("生活");
  });

  it("should_include_all_action_types_in_prompt", () => {
    const prompt = buildCommandFullPrompt(baseCtx);
    // 待办操作
    expect(prompt).toContain("create_todo");
    expect(prompt).toContain("complete_todo");
    expect(prompt).toContain("modify_todo");
    expect(prompt).toContain("delete_todo");
    expect(prompt).toContain("query_todo");
    // 日记操作
    expect(prompt).toContain("create_record");
    expect(prompt).toContain("query_record");
    // 搜索
    expect(prompt).toContain("search");
    // 主题
    expect(prompt).toContain("manage_wiki_page");
  });

  it("should_include_date_anchor_in_prompt", () => {
    const prompt = buildCommandFullPrompt(baseCtx);
    // buildDateAnchor 包含时间锚点表
    expect(prompt).toContain("时间锚点");
    expect(prompt).toContain("今天");
    expect(prompt).toContain("明天");
  });

  it("should_show_empty_hint_when_no_todos", () => {
    const ctx: CommandFullContext = {
      pendingTodos: [],
      activeGoals: [],
      wikiPages: [],
    };
    const prompt = buildCommandFullPrompt(ctx);
    expect(prompt).toContain("无未完成待办");
    expect(prompt).toContain("无活跃目标");
    expect(prompt).toContain("无主题");
  });

  it("should_include_scheduled_start_for_todos_that_have_it", () => {
    const prompt = buildCommandFullPrompt(baseCtx);
    expect(prompt).toContain("2026-04-11T09:00:00");
  });

  it("should_contain_instruction_that_this_is_100_percent_command_intent", () => {
    const prompt = buildCommandFullPrompt(baseCtx);
    expect(prompt).toContain("100%");
    expect(prompt).toContain("指令意图");
  });

  it("should_contain_json_output_format_instruction", () => {
    const prompt = buildCommandFullPrompt(baseCtx);
    expect(prompt).toContain("commands");
    expect(prompt).toContain("JSON");
  });
});
