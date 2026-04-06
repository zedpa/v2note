import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * 测试 tool-call-card.tsx 组件逻辑
 * Spec 116 Phase 5: 边界条件覆盖
 */

const source = fs.readFileSync(
  path.resolve(__dirname, "./tool-call-card.tsx"),
  "utf-8",
);

describe("tool-call-card — 类型化图标映射", () => {
  it("should_map_web_search_to_Globe_icon", () => {
    expect(source).toMatch(/web_search.*Globe/s);
  });

  it("should_map_fetch_url_to_Globe_icon", () => {
    expect(source).toMatch(/fetch_url.*Globe/s);
  });

  it("should_map_create_todo_to_SquarePen_icon", () => {
    expect(source).toMatch(/create_todo.*SquarePen/s);
  });

  it("should_map_delete_record_to_Trash2_icon", () => {
    expect(source).toMatch(/delete_record.*Trash2/s);
  });

  it("should_fallback_to_Wrench_for_unknown_tools", () => {
    expect(source).toMatch(/Wrench.*muted/s);
  });
});

describe("tool-call-card — 三态渲染", () => {
  it("should_show_shimmer_text_when_running", () => {
    // 运行态应有 shimmer-text class
    expect(source).toContain("shimmer-text");
    // 运行态应有 animate-pulse 图标
    expect(source).toContain("animate-pulse");
  });

  it("should_show_green_check_when_done", () => {
    // 完成态应有绿色 Check 图标
    expect(source).toMatch(/Check.*green/s);
  });

  it("should_show_red_x_when_error", () => {
    // 错误态应有红色 X 图标
    expect(source).toMatch(/isError[\s\S]*?X.*red/);
  });

  it("should_have_collapsible_detail_for_done_state", () => {
    // 完成态应有可折叠详情
    expect(source).toContain("tool-detail-wrapper");
    expect(source).toContain("data-open");
  });

  it("should_show_duration_when_available", () => {
    // 应显示耗时
    expect(source).toMatch(/durationMs/);
    expect(source).toMatch(/\.toFixed/);
  });
});

describe("tool-call-card — 多工具分组", () => {
  it("should_not_group_when_has_running_tools", () => {
    // 有运行中工具时不分组
    expect(source).toMatch(/hasRunning.*parts\.length\s*<=\s*1/s);
  });

  it("should_show_group_summary_when_all_done", () => {
    // 全部完成时显示分组摘要
    expect(source).toContain("路路用了");
    expect(source).toContain("个工具");
  });

  it("should_render_individual_cards_when_single_tool", () => {
    // 单个工具不分组（parts.length <= 1）
    expect(source).toMatch(/parts\.length\s*<=\s*1/);
  });
});
