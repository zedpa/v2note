/**
 * 单元测试：digest-prompt.ts — Phase 2 Ingest 改造
 *
 * 核心变更：buildDigestPrompt → buildIngestPrompt
 * - 只提取 intend（待办/目标），不生成 Strike/Bond
 * - 保留 dateAnchor 时间锚点
 * - 输出 JSON 结构只含 intends[]（domain 已移除）
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
    it("should_include_granularity_types", () => {
        const prompt = buildIngestPrompt();
        expect(prompt).toContain("action");
        expect(prompt).toContain("goal");
        expect(prompt).toContain("project");
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
//# sourceMappingURL=digest-prompt.test.js.map