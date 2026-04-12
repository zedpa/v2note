/**
 * cognitive-report spec 测试 (v3 — wiki page 数据源)
 * 覆盖场景: 结构化认知报告生成、无活动降级
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockQuery = vi.fn().mockResolvedValue([]);

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: vi.fn().mockResolvedValue(null),
  execute: vi.fn(),
}));

// =====================================================================
// 场景 1: 结构化认知报告（wiki page 数据源）
// =====================================================================
describe("场景1: 结构化认知报告 (wiki)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_generate_report_with_today_records_count", { timeout: 30000 }, async () => {
    const { generateCognitiveReport } = await import("./report.js");

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM record") && sql.includes("COUNT")) {
        return Promise.resolve([{ count: "12" }]);
      }
      if (sql.includes("wiki_page") && sql.includes("矛盾")) {
        return Promise.resolve([]);
      }
      if (sql.includes("wiki_page") && sql.includes("created_at")) {
        return Promise.resolve([]);
      }
      if (sql.includes("todo") && sql.includes("done")) {
        return Promise.resolve([{ total: "10", done: "4" }]);
      }
      return Promise.resolve([]);
    });

    const report = await generateCognitiveReport({ userId: "user-1" });

    expect(report.today_records).toBe(12);
    expect(report.behavior_drift.today_records).toBe(12);
    expect(report.behavior_drift.todo_completed).toBe(4);
    expect(report.behavior_drift.completion_rate).toBeCloseTo(0.4);
  });

  it("should_include_contradictions_from_wiki_pages", async () => {
    const { generateCognitiveReport } = await import("./report.js");

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM record") && sql.includes("COUNT")) {
        return Promise.resolve([{ count: "5" }]);
      }
      if (sql.includes("wiki_page") && sql.includes("矛盾")) {
        return Promise.resolve([
          {
            title: "供应链管理",
            content: "## 核心认知\n内容\n## 矛盾 / 未决\n- 供应商A质量好但贵 vs 供应商B便宜但不稳定\n## 目标",
          },
        ]);
      }
      if (sql.includes("wiki_page") && sql.includes("created_at")) {
        return Promise.resolve([]);
      }
      if (sql.includes("todo")) {
        return Promise.resolve([{ total: "0", done: "0" }]);
      }
      return Promise.resolve([]);
    });

    const report = await generateCognitiveReport({ userId: "user-1" });
    expect(report.contradictions.length).toBe(1);
    expect(report.contradictions[0].page_title).toBe("供应链管理");
    expect(report.contradictions[0].snippet).toContain("供应商A");
  });

  it("should_include_wiki_changes", async () => {
    const { generateCognitiveReport } = await import("./report.js");
    // 使用 tz.today() 获取与 report.ts 内部一致的日期
    const { today: tzToday } = await import("../lib/tz.js");
    // 构造一个"今天创建"的 ISO 时间戳（北京时间中午12点，保证日期一致）
    const todayCreated = `${tzToday()}T12:00:00+08:00`;

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM record") && sql.includes("COUNT")) {
        return Promise.resolve([{ count: "3" }]);
      }
      if (sql.includes("wiki_page") && sql.includes("矛盾")) {
        return Promise.resolve([]);
      }
      if (sql.includes("wiki_page") && sql.includes("created_at")) {
        return Promise.resolve([
          { title: "新页面", created_at: todayCreated, updated_at: todayCreated },
        ]);
      }
      if (sql.includes("todo")) {
        return Promise.resolve([{ total: "0", done: "0" }]);
      }
      return Promise.resolve([]);
    });

    const report = await generateCognitiveReport({ userId: "user-1" });
    expect(report.wiki_changes.length).toBe(1);
    expect(report.wiki_changes[0].title).toBe("新页面");
    expect(report.wiki_changes[0].type).toBe("created");
  });
});

// =====================================================================
// 场景 5: 无活动日降级
// =====================================================================
describe("场景5: 无活动日降级 (wiki)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_return_empty_report_when_no_activity", async () => {
    const { generateCognitiveReport } = await import("./report.js");

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM record") && sql.includes("COUNT")) {
        return Promise.resolve([{ count: "0" }]);
      }
      return Promise.resolve([]);
    });

    const report = await generateCognitiveReport({ userId: "user-1" });

    expect(report.today_records).toBe(0);
    expect(report.contradictions).toEqual([]);
    expect(report.wiki_changes).toEqual([]);
    expect(report.is_empty).toBe(true);
  });
});
