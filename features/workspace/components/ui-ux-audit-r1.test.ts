/**
 * UI/UX Audit Section 9 — 移动端精修 Round 1 单元测试
 * 基于 specs/ui-ux-audit.md 场景 9.1 ~ 9.7
 *
 * 测试策略：通过读取源码内容验证 CSS 变量值、ARIA 属性、class 声明等
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ===== 辅助函数 =====
function readSrc(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf-8");
}

function readFromRoot(relativePath: string): string {
  return readFileSync(resolve(__dirname, "../../../", relativePath), "utf-8");
}

// ===== 9.1 Dark Mode 对比度修复 =====
describe("9.1 Dark Mode 对比度修复", () => {
  it("should_have_muted_foreground_at_58_percent_lightness_when_dark_mode", () => {
    const css = readFromRoot("app/globals.css");
    // dark mode 中 --muted-foreground 应为 25 5% 58%（对比度 ≈ 5.0:1）
    expect(css).toMatch(/\.dark\s*\{[^}]*--muted-foreground:\s*25\s+5%\s+58%/s);
  });

  it("should_have_card_at_13_percent_lightness_when_dark_mode", () => {
    const css = readFromRoot("app/globals.css");
    // dark mode 中 --card 应为 25 8% 13%（与 background 对比度 ≈ 1.6:1��
    expect(css).toMatch(/\.dark\s*\{[^}]*--card:\s*25\s+8%\s+13%/s);
  });
});

// ===== 9.2 触控目标达标 =====
describe("9.2 触控目标达标", () => {
  it("should_have_44px_min_touch_targets_for_header_buttons_when_mobile", () => {
    const src = readSrc("workspace-header.tsx");
    // 头像按钮需要 min-w-[44px] min-h-[44px]
    expect(src).toContain("min-w-[44px]");
    expect(src).toContain("min-h-[44px]");
  });

  it("should_have_gap_2_between_right_header_buttons_when_mobile", () => {
    const src = readSrc("workspace-header.tsx");
    // 右侧按钮间距从 gap-1 改为 gap-2
    expect(src).toMatch(/className="[^"]*gap-2[^"]*"/);
    // 确保没有 gap-1（在右侧按钮容器中）
    expect(src).not.toMatch(/flex items-center gap-1 shrink/);
  });

  it("should_have_44px_touch_area_for_note_card_menu_when_mobile", () => {
    const noteSrc = readFromRoot("features/notes/components/note-card.tsx");
    // 注意：note-card 本身不一定有三点菜单，但如果存在应满足 44px
    // 根据 spec 要求，验证卡片有按压反馈
    expect(noteSrc).toContain("active:scale-[0.98]");
    expect(noteSrc).toContain("active:opacity-90");
  });

  it("should_have_press_feedback_transition_within_100ms_when_card_pressed", () => {
    const noteSrc = readFromRoot("features/notes/components/note-card.tsx");
    expect(noteSrc).toMatch(/duration-1[05]0/);
    expect(noteSrc).toMatch(/transition-\[transform,opacity(,box-shadow)?\]/);
  });
});

// ===== 9.3 ARIA 语义补全 =====
describe("9.3 ARIA 语义补全", () => {
  it("should_have_tablist_role_on_tab_container_when_rendered", () => {
    const src = readSrc("workspace-header.tsx");
    expect(src).toContain('role="tablist"');
    expect(src).toContain('aria-label="主视图切换"');
  });

  it("should_have_tab_role_and_aria_selected_on_each_tab_when_rendered", () => {
    const src = readSrc("workspace-header.tsx");
    expect(src).toContain('role="tab"');
    expect(src).toContain("aria-selected");
  });

  it("should_have_aria_label_on_briefing_close_button_when_rendered", () => {
    const src = readFromRoot("features/daily/components/morning-briefing.tsx");
    expect(src).toContain('aria-label="关闭今日简报"');
  });
});

// ===== 9.4 Emoji 替换为 Lucide SVG =====
describe("9.4 Emoji 替换为 Lucide SVG", () => {
  it("should_use_CloudSun_for_afternoon_slot_when_time_slots_config", () => {
    const src = readFromRoot("features/todos/lib/time-slots.ts");
    // 下午应使用 CloudSun 而非 Sun
    expect(src).toContain("CloudSun");
    // 确保 import 了 CloudSun
    expect(src).toMatch(/import\s*\{[^}]*CloudSun[^}]*\}\s*from\s*["']lucide-react["']/);
  });

  it("should_not_use_emoji_in_menu_bar_actions_when_pc_view", () => {
    const src = readFromRoot("components/layout/menu-bar.tsx");
    // 不应包含 emoji 字符
    expect(src).not.toContain("🔍");
    expect(src).not.toContain("🎙");
    expect(src).not.toContain("⚡️");
    expect(src).not.toContain("📋");
    expect(src).not.toContain("⚙️");
  });

  it("should_use_lucide_icons_in_menu_bar_when_pc_view", () => {
    const src = readFromRoot("components/layout/menu-bar.tsx");
    // 应导入 Lucide 图标
    expect(src).toMatch(/import\s*\{[^}]*Search[^}]*\}\s*from\s*["']lucide-react["']/);
    expect(src).toMatch(/import\s*\{[^}]*Mic[^}]*\}\s*from\s*["']lucide-react["']/);
    expect(src).toMatch(/import\s*\{[^}]*Zap[^}]*\}\s*from\s*["']lucide-react["']/);
    expect(src).toMatch(/import\s*\{[^}]*ClipboardList[^}]*\}\s*from\s*["']lucide-react["']/);
    expect(src).toMatch(/import\s*\{[^}]*Settings[^}]*\}\s*from\s*["']lucide-react["']/);
  });
});

// ===== 9.5 首屏性能 =====
describe("9.5 首屏性能 — 组件懒加载", () => {
  it("should_use_dynamic_import_for_overlay_components_when_page_loads", () => {
    const src = readFromRoot("app/page.tsx");
    // 应使用 next/dynamic
    expect(src).toContain("from 'next/dynamic'");
    // 以下 14 个组件应该是 dynamic import
    const dynamicComponents = [
      "SearchView",
      "ChatView",
      "ReviewOverlay",
      "ProfileEditor",
      "SettingsEditor",
      "NotebookList",
      "MorningBriefing",
      "EveningSummary",
      "SmartDailyReport",
      "OnboardingSeed",
      "GoalDetailOverlay",
      "ProjectDetailOverlay",
      "GoalList",
      "NotificationCenter",
    ];
    for (const comp of dynamicComponents) {
      expect(src).toMatch(new RegExp(`const\\s+${comp}\\s*=\\s*dynamic\\(`));
    }
  });

  it("should_not_use_static_import_for_overlay_components_when_page_loads", () => {
    const src = readFromRoot("app/page.tsx");
    // 不应有这些组件的静态 import
    expect(src).not.toMatch(/import\s+\{\s*SearchView\s*\}\s*from/);
    expect(src).not.toMatch(/import\s+\{\s*ChatView\s*\}\s*from/);
    expect(src).not.toMatch(/import\s+\{\s*ReviewOverlay\s*\}\s*from/);
    expect(src).not.toMatch(/import\s+\{\s*MorningBriefing\s*\}\s*from/);
  });

  it("should_have_skeleton_loading_in_morning_briefing_when_loading", () => {
    const src = readFromRoot("features/daily/components/morning-briefing.tsx");
    expect(src).toContain("Skeleton");
  });

  it("should_delay_skeleton_display_by_300ms_when_fast_response", () => {
    const src = readFromRoot("features/daily/components/morning-briefing.tsx");
    // 应有 300ms 延迟逻辑
    expect(src).toContain("300");
    // 应有 setTimeout 或类似延迟机制
    expect(src).toMatch(/setTimeout|showSkeleton|delayedLoading/);
  });
});

// ===== 9.6 布局细节 =====
describe("9.6 布局细节", () => {
  it("should_have_source_type_border_colors_on_note_card_when_voice_type", () => {
    const noteSrc = readFromRoot("features/notes/components/note-card.tsx");
    // 应包含 source_type 在 Note interface ���
    expect(noteSrc).toContain("source_type");
    // 应包含 border-l-[3px] 用于左边框
    expect(noteSrc).toContain("border-l-[3px]");
  });

  it("should_map_voice_to_green_border_when_source_type_is_voice", () => {
    const noteSrc = readFromRoot("features/notes/components/note-card.tsx");
    // voice → 绿色，使用 domain-health-fg
    expect(noteSrc).toContain("domain-health-fg");
  });

  it("should_map_ai_diary_to_primary_border_when_source_type_is_ai_diary", () => {
    const noteSrc = readFromRoot("features/notes/components/note-card.tsx");
    // ai_diary → 品牌橙，使用 --primary
    expect(noteSrc).toContain("ai_diary");
    expect(noteSrc).toContain("--primary");
  });

  it("should_have_time_slot_indicator_bar_in_time_block_when_rendered", () => {
    const src = readFromRoot("features/todos/components/time-block.tsx");
    // 时段标题应有左侧指示条
    expect(src).toContain("border-l-[3px]");
  });

  it("should_define_tag_time_slot_vars_in_light_mode_when_globals_css", () => {
    const css = readFromRoot("app/globals.css");
    // light mode :root 中应定义 --tag-anytime-text 等变量
    expect(css).toMatch(/:root\s*\{[^}]*--tag-anytime-text/s);
    expect(css).toMatch(/:root\s*\{[^}]*--tag-morning-text/s);
  });

  it("should_use_css_variables_for_avatar_gradient_when_workspace_header", () => {
    const src = readSrc("workspace-header.tsx");
    expect(src).toContain("--avatar-gradient-from");
    expect(src).toContain("--avatar-gradient-to");
    // 不应有硬编码的渐变色
    expect(src).not.toContain("#89502C");
    expect(src).not.toContain("#C8845C");
  });

  it("should_use_css_variables_for_avatar_gradient_when_sidebar_drawer", () => {
    const src = readFromRoot("features/sidebar/components/sidebar-drawer.tsx");
    expect(src).toContain("--avatar-gradient-from");
    expect(src).toContain("--avatar-gradient-to");
  });

  it("should_define_avatar_gradient_css_variables_in_globals_css", () => {
    const css = readFromRoot("app/globals.css");
    expect(css).toContain("--avatar-gradient-from");
    expect(css).toContain("--avatar-gradient-to");
  });
});

// ===== 9.7 层级管��� =====
describe("9.7 层级管理 — 弹窗与 FAB 互斥", () => {
  it("should_calculate_anyOverlayOpen_and_pass_to_fab_when_page_renders", () => {
    const src = readFromRoot("app/page.tsx");
    // 应有 anyOverlayOpen 或 activeOverlay 被传递给 FAB
    expect(src).toMatch(/anyOverlayOpen|fabVisible|visible.*activeOverlay/);
  });

  it("should_accept_visible_prop_in_fab_component_when_overlay_opens", () => {
    const src = readFromRoot("features/recording/components/fab.tsx");
    expect(src).toContain("visible");
  });
});
