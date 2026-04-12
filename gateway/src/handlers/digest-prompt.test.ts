/**
 * 单元测试：digest-prompt.ts — Phase 14.2 废弃 Goal 提取
 *
 * 核心变更：buildIngestPrompt 只提取 action 粒度的待办
 * - 移除 goal/project 粒度的提取指令
 * - 保留 dateAnchor 时间锚点
 * - 输出 JSON 结构只含 intends[]（每条均为 action）
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/date-anchor.js", () => ({
  buildDateAnchor: vi.fn().mockReturnValue("## 时间锚点\n当前：2026-04-09（周四）"),
}));

import { buildIngestPrompt } from "./digest-prompt.js";

describe("buildIngestPrompt (Phase 2 — Ingest 改造)", () => {
  it("should_return_prompt_mentioning_intend_extraction", () => {
    const prompt = buildIngestPrompt();
    expect(prompt).toContain("intend");
  });

  it("should_include_date_anchor", () => {
    const prompt = buildIngestPrompt();
    expect(prompt).toContain("时间锚点");
  });

  it("should_include_output_json_format_with_intends", () => {
    const prompt = buildIngestPrompt();
    expect(prompt).toContain("intends");
  });

  it("should_not_include_domain_assignment", () => {
    const prompt = buildIngestPrompt();
    // Phase 11: domain 分配已移除，prompt 不应引导 AI 分配 domain
    expect(prompt).not.toContain("自动归类");
    expect(prompt).not.toContain("一级分类");
  });

  it("should_only_mention_action_granularity_not_goal_or_project", () => {
    // Phase 14.2: digest prompt 只保留 action 粒度，移除 goal/project
    const prompt = buildIngestPrompt();
    expect(prompt).toContain("action");
    expect(prompt).not.toMatch(/granularity/);
    expect(prompt).not.toMatch(/"goal"/);
    expect(prompt).not.toMatch(/"project"/);
  });

  it("should_instruct_not_to_extract_multi_step_goals", () => {
    const prompt = buildIngestPrompt();
    // prompt 应明确指出多步骤/长周期目标不提取
    expect(prompt).toMatch(/多步骤|长周期|目标.*不.*提取|不提取/);
  });

  it("should_not_mention_strike_decomposition", () => {
    const prompt = buildIngestPrompt();
    expect(prompt).not.toContain("Strike");
    expect(prompt).not.toContain("strikes");
  });

  it("should_not_mention_bond", () => {
    const prompt = buildIngestPrompt();
    expect(prompt).not.toContain("Bond");
    expect(prompt).not.toContain("bonds");
  });

  it("should_instruct_empty_intends_when_no_actionable_content", () => {
    const prompt = buildIngestPrompt();
    expect(prompt).toContain("intends");
    expect(prompt).toContain("[]");
  });
});
