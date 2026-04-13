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
      },
    ],
    allPageIndex: [
      { id: "page-1", title: "供应链管理", summary: "铝价和供应链相关", level: 2, page_type: "topic" },
      { id: "page-2", title: "健康管理", summary: "运动和饮食", level: 3, page_type: "topic" },
    ],
    existingGoals: [],
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

  it("should_not_contain_domain_classification_rules_when_domain_deprecated", () => {
    const { system } = buildCompilePrompt(baseInput);

    expect(system).not.toContain("优先复用已有 domain");
    expect(system).not.toContain("domain 是简短中文一级分类");
  });

  it("should_contain_cold_start_hint_when_is_cold_start", () => {
    const input: CompilePromptInput = {
      ...baseInput,
      matchedPages: [],
      allPageIndex: [],
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

  // ── Phase 14.8: Title 自然化规则 ──

  describe("Title 自然化 (14.8)", () => {
    it("should_not_contain_character_count_limit_when_prompt_built", () => {
      const { system } = buildCompilePrompt(baseInput);
      // 旧限制："2-8个中文字符" 应被移除
      expect(system).not.toContain("2-8个中文字符");
      expect(system).not.toContain("2-8");
    });

    it("should_contain_natural_naming_rules_when_prompt_built", () => {
      const { system } = buildCompilePrompt(baseInput);
      expect(system).toContain("自然语言命名");
    });

    it("should_contain_level_specific_naming_guidance_when_prompt_built", () => {
      const { system } = buildCompilePrompt(baseInput);
      // L3 允许简短
      expect(system).toMatch(/L3.*简短/);
      // L2/L1 应具体
      expect(system).toMatch(/L2.*具体/);
    });

    it("should_contain_goal_page_naming_rule_when_prompt_built", () => {
      const { system } = buildCompilePrompt(baseInput);
      // goal page title = 目标本身
      expect(system).toMatch(/goal.*目标本身/i);
    });

    it("should_not_contain_old_title_format_in_json_example_when_prompt_built", () => {
      const { system } = buildCompilePrompt(baseInput);
      expect(system).not.toContain("新主题名称（2-8个中文字符）");
    });
  });

  // ── fix-goal-quality: 去重 + 层级组织 ──

  describe("goal_quality_dedup (fix-goal-quality)", () => {
    it("should_contain_existing_goals_in_user_message_when_goals_provided", () => {
      const input: CompilePromptInput = {
        ...baseInput,
        existingGoals: [
          { id: "goal-1", title: "学英语", status: "active", wiki_page_id: "wp-1" },
          { id: "goal-2", title: "减重10kg", status: "progressing", wiki_page_id: null },
        ],
      };

      const { user } = buildCompilePrompt(input);

      expect(user).toContain("已有目标");
      expect(user).toContain("goal-1");
      expect(user).toContain("学英语");
      expect(user).toContain("active");
      expect(user).toContain("wp-1");
      expect(user).toContain("goal-2");
      expect(user).toContain("减重10kg");
      expect(user).toContain("progressing");
    });

    it("should_not_contain_existing_goals_section_when_no_goals", () => {
      const { user } = buildCompilePrompt(baseInput);

      expect(user).not.toContain("已有目标");
    });

    it("should_contain_page_type_column_in_page_index_when_pages_have_type", () => {
      const input: CompilePromptInput = {
        ...baseInput,
        allPageIndex: [
          { id: "page-1", title: "工作", summary: "工作相关", level: 3, page_type: "topic" },
          { id: "page-goal", title: "学英语", summary: "英语学习", level: 2, page_type: "goal" },
        ],
      };

      const { user } = buildCompilePrompt(input);

      expect(user).toContain("类型");
      expect(user).toContain("topic");
      expect(user).toContain("goal");
    });

    it("should_contain_goal_dedup_instruction_in_system_prompt", () => {
      const { system } = buildCompilePrompt(baseInput);

      expect(system).toContain("已有目标");
      expect(system).toContain("update 而非 create");
      expect(system).toContain("反例");
    });

    it("should_contain_parent_page_id_in_goal_sync_json_example", () => {
      const { system } = buildCompilePrompt(baseInput);

      expect(system).toContain("parent_page_id");
      expect(system).toContain("挂载到哪个 topic page 下");
    });

    it("should_contain_goal_sync_update_example_in_system_prompt", () => {
      const { system } = buildCompilePrompt(baseInput);

      // 新增的 update 示例
      expect(system).toContain('"action": "update"');
      expect(system).toContain("goal_id");
    });
  });
});
