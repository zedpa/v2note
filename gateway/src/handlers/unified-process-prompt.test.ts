import { describe, it, expect } from "vitest";
import { buildUnifiedProcessPrompt } from "./unified-process-prompt.js";

const ctx = {
  activeGoals: [],
  pendingTodos: [],
  existingPages: [],
};

describe("buildUnifiedProcessPrompt", () => {
  const prompt = buildUnifiedProcessPrompt(ctx);

  it("should_default_to_record_intent_type", () => {
    expect(prompt).toContain("**record**（默认）");
    expect(prompt).toContain("绝大部分情况都是 record");
  });

  it("should_not_contain_mixed_intent_type", () => {
    // mixed 已废弃
    expect(prompt).not.toContain("**mixed**");
  });

  it("should_only_allow_create_todo_and_modify_todo_commands", () => {
    expect(prompt).toContain("create_todo: 创建新待办");
    expect(prompt).toContain("modify_todo: 修改已有待办");
    // 不应作为可用指令列出 complete_todo 和 query_todo
    expect(prompt).toContain("不支持 complete_todo 和 query_todo");
    // 可用指令部分不应有 complete_todo 的定义行
    expect(prompt).not.toContain("complete_todo: ");
    expect(prompt).not.toContain("query_todo: ");
  });

  it("should_emphasize_record_is_default_in_constraints", () => {
    expect(prompt).toContain("intent_type 绝大部分情况是 \"record\"");
  });

  it("should_require_action_only_for_pure_commands", () => {
    expect(prompt).toContain("完全**在下直接操作指令");
    expect(prompt).toContain("有叙述就是 record");
  });

  // fix-process-domain-to-page 新增测试
  it("should_contain_page_title_not_domain_in_section3", () => {
    expect(prompt).toContain("自动归类 → page_title");
    expect(prompt).not.toContain("自动归类 → domain");
  });

  it("should_not_contain_domain_field_in_output_example", () => {
    expect(prompt).not.toContain('"domain"');
    expect(prompt).toContain('"page_title"');
  });

  it("should_contain_page_title_based_tags_logic", () => {
    expect(prompt).toContain("第一个标签为 page_title");
    expect(prompt).not.toContain("domain 路径各段");
    expect(prompt).not.toContain("domain 的每层路径");
  });

  it("should_show_existing_pages_when_provided", () => {
    const ctxWithPages = {
      activeGoals: [],
      pendingTodos: [],
      existingPages: [
        { id: "p1", title: "采购管理" },
        { id: "p2", title: "Rust 学习" },
      ],
    };
    const p = buildUnifiedProcessPrompt(ctxWithPages);
    expect(p).toContain("用户已有知识页面");
    expect(p).toContain("- 采购管理");
    expect(p).toContain("- Rust 学习");
  });

  it("should_not_show_page_list_section_when_no_pages", () => {
    // 动态注入的 page 列表区域（带有"优先从中选择"提示）不应出现
    expect(prompt).not.toContain("优先从中选择语义最匹配的标题原样返回，不确定时建议新标题");
  });

  it("should_contain_page_title_in_comment", () => {
    expect(prompt).not.toContain("summary + domain + tags");
  });
});
