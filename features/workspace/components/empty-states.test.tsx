/**
 * empty-state-guide spec 验证
 * 确认各组件的空状态文案符合 spec 要求
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// 通过源码验证空状态文案是否符合 spec
describe("empty-state text verification", () => {
  // 场景 1: 待办空状态 — 区分"全部完成"和"从未创建"
  it("should_have_differentiated_todo_empty_states", () => {
    const src = readFileSync(
      resolve(__dirname, "todo-workspace-view.tsx"),
      "utf-8",
    );
    // 全部完成
    expect(src).toContain("今天的事都做完了");
    // 从未创建
    expect(src).toContain("还没有待办");
    // 引导 FAB
    expect(src).toContain("麦克风");
  });

  // 场景 5: 认知统计空状态 — 进度条
  it("should_have_stats_empty_state_with_progress", () => {
    const src = readFileSync(
      resolve(__dirname, "../../sidebar/components/stats-dashboard.tsx"),
      "utf-8",
    );
    expect(src).toContain("积累 5 条以上记录");
    expect(src).toContain("/ 5");
  });

  // 场景 6: 侧边栏 — 自动归类文件夹（方向区已重构为分类视图）
  it("should_have_auto_categorization_in_sidebar", () => {
    const src = readFileSync(
      resolve(__dirname, "../../sidebar/components/sidebar-drawer.tsx"),
      "utf-8",
    );
    expect(src).toContain("自动归类");
    expect(src).not.toContain("暂无数据");
  });
});
