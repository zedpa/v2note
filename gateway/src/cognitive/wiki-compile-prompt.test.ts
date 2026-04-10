import { describe, it, expect, vi } from "vitest";

// Mock date-anchor
vi.mock("../lib/date-anchor.js", () => ({
  buildDateAnchor: () => "## 时间锚点（测试）\n当前：2026-04-09（周四）",
}));

import { buildCompilePrompt, type CompilePromptInput } from "./wiki-compile-prompt.js";

describe("wiki-compile-prompt", () => {
  const baseInput: CompilePromptInput = {
    newRecords: [
      {
        id: "rec-1",
        text: "今天跟张总讨论了铝价的事情，他认为短期会继续涨",
        source_type: "think",
        created_at: "2026-04-09",
      },
    ],
    matchedPages: [
      {
        id: "page-1",
        title: "供应链管理",
        content: "## 核心认知\n铝价近期波动较大 [→ rec:old-1]",
        summary: "铝价和供应链相关",
        level: 2,
        domain: "工作",
      },
    ],
    allPageIndex: [
      { id: "page-1", title: "供应链管理", summary: "铝价和供应链相关", level: 2, domain: "工作" },
      { id: "page-2", title: "健康管理", summary: "运动和饮食", level: 3, domain: "生活" },
    ],
    existingDomains: ["工作", "生活"],
    isColdStart: false,
  };

  it("should_contain_record_text_when_records_provided", () => {
    const { user } = buildCompilePrompt(baseInput);

    expect(user).toContain("rec-1");
    expect(user).toContain("今天跟张总讨论了铝价的事情");
    expect(user).toContain("[用户日记]");
  });

  it("should_contain_matched_page_content_when_pages_matched", () => {
    const { user } = buildCompilePrompt(baseInput);

    expect(user).toContain("供应链管理");
    expect(user).toContain("铝价近期波动较大");
    expect(user).toContain("page-1");
  });

  it("should_contain_page_index_when_pages_exist", () => {
    const { user } = buildCompilePrompt(baseInput);

    expect(user).toContain("全部 Wiki Page 索引");
    expect(user).toContain("健康管理");
    expect(user).toContain("page-2");
  });

  it("should_contain_content_format_spec_in_system_prompt", () => {
    const { system } = buildCompilePrompt(baseInput);

    expect(system).toContain("## 核心认知");
    expect(system).toContain("## 关键决策链");
    expect(system).toContain("## 矛盾 / 未决");
    expect(system).toContain("## 目标");
    expect(system).toContain("[→ rec:UUID]");
    expect(system).toContain("[直述]");
    expect(system).toContain("[推断]");
    expect(system).toContain("[关联]");
  });

  it("should_contain_json_output_format_in_system_prompt", () => {
    const { system } = buildCompilePrompt(baseInput);

    expect(system).toContain("update_pages");
    expect(system).toContain("create_pages");
    expect(system).toContain("merge_pages");
    expect(system).toContain("split_page");
    expect(system).toContain("goal_sync");
  });

  it("should_contain_existing_domains_when_provided", () => {
    const { system } = buildCompilePrompt(baseInput);

    expect(system).toContain("工作");
    expect(system).toContain("生活");
    expect(system).toContain("优先复用已有 domain");
  });

  it("should_contain_cold_start_hint_when_is_cold_start", () => {
    const input: CompilePromptInput = {
      ...baseInput,
      matchedPages: [],
      allPageIndex: [],
      existingDomains: [],
      isColdStart: true,
    };

    const { system } = buildCompilePrompt(input);

    expect(system).toContain("冷启动模式");
    expect(system).toContain("创建 1-2 个宽泛的 L3 page");
  });

  it("should_not_contain_cold_start_hint_when_not_cold_start", () => {
    const { system } = buildCompilePrompt(baseInput);

    expect(system).not.toContain("冷启动模式");
  });

  it("should_label_material_records_correctly", () => {
    const input: CompilePromptInput = {
      ...baseInput,
      newRecords: [
        {
          id: "rec-mat-1",
          text: "一篇关于铝期货的文章",
          source_type: "material",
          created_at: "2026-04-09",
        },
      ],
    };

    const { user } = buildCompilePrompt(input);

    expect(user).toContain("[外部素材]");
  });

  it("should_contain_date_anchor_in_system_prompt", () => {
    const { system } = buildCompilePrompt(baseInput);

    expect(system).toContain("时间锚点");
  });

  it("should_contain_material_handling_rules_in_system_prompt", () => {
    const { system } = buildCompilePrompt(baseInput);

    expect(system).toContain("material");
    expect(system).toContain("不创建新页");
  });

  it("should_contain_no_ai_reasoning_rule", () => {
    const { system } = buildCompilePrompt(baseInput);

    expect(system).toContain("禁止");
    expect(system).toContain("只编译用户说了什么");
  });

  it("should_return_system_and_user_messages", () => {
    const result = buildCompilePrompt(baseInput);

    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("user");
    expect(typeof result.system).toBe("string");
    expect(typeof result.user).toBe("string");
    expect(result.system.length).toBeGreaterThan(100);
    expect(result.user.length).toBeGreaterThan(10);
  });
});
