/**
 * design-visual-alignment spec — 场景 1.2 & 1.3
 * 验证设计 token（字体、色彩、阴影）与 Editorial Serenity 规范一致
 */
import { describe, it, expect } from "vitest";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../tailwind.config";

const fullConfig = resolveConfig(tailwindConfig as any);
const theme = fullConfig.theme;

describe("design-visual-alignment: 场景 1.3 — Tailwind 设计 token", () => {
  it("should_have_correct_surface_hierarchy_colors", () => {
    const colors = theme.colors as any;
    expect(colors.surface).toBeDefined();
    expect(colors["surface-low"]).toBeDefined();
    expect(colors["surface-lowest"]).toBeDefined();
    expect(colors["surface-high"]).toBeDefined();
    expect(colors["on-surface"]).toBeDefined();
    expect(colors["ghost-border"]).toBeDefined();
  });

  it("should_have_correct_semantic_colors", () => {
    const colors = theme.colors as any;
    expect(colors.deer).toBeDefined();
    expect(colors.forest).toBeDefined();
    expect(colors.sky).toBeDefined();
    expect(colors.dawn).toBeDefined();
    expect(colors.maple).toBeDefined();
  });

  it("should_have_shadow_ambient_token", () => {
    const shadows = theme.boxShadow as any;
    expect(shadows.ambient).toBeDefined();
    expect(shadows.ambient).toContain("var(--shadow-ambient)");
  });

  it("should_have_font_families_matching_editorial_serenity", () => {
    const fonts = theme.fontFamily as any;
    // serif 字体用于标题/日期（Newsreader 或 Noto Serif SC）
    expect(fonts.serif).toBeDefined();
    // body 字体用于正文（Inter 系列）
    expect(fonts.body).toBeDefined();
    // mono 字体用于元数据
    expect(fonts.mono).toBeDefined();
  });
});

describe("design-visual-alignment: 场景 1.2 — 字体替换", () => {
  it("should_have_newsreader_in_serif_font_stack", () => {
    const fonts = theme.fontFamily as any;
    const serifStack = Array.isArray(fonts.serif) ? fonts.serif : [];
    // Newsreader 应在 serif 字体栈中（通过 CSS 变量或直接引用）
    const hasNewsreader = serifStack.some(
      (f: string) => f.includes("Newsreader") || f.includes("--font-serif"),
    );
    expect(hasNewsreader).toBe(true);
  });

  it("should_have_inter_in_body_font_stack", () => {
    const fonts = theme.fontFamily as any;
    const bodyStack = Array.isArray(fonts.body) ? fonts.body : [];
    const hasInter = bodyStack.some(
      (f: string) => f.includes("Inter") || f.includes("--font-body"),
    );
    expect(hasInter).toBe(true);
  });
});
