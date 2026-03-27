/**
 * decision-template spec 测试
 * 场景 1: 闭环检测 | 场景 2: 模板匹配
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockQuery = vi.fn().mockResolvedValue([]);
const mockQueryOne = vi.fn().mockResolvedValue(null);
const mockExecute = vi.fn().mockResolvedValue(0);

vi.mock("../db/pool.js", () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  execute: (...args: any[]) => mockExecute(...args),
}));

vi.mock("../db/repositories/goal.js", () => ({
  findById: (...args: any[]) => mockQueryOne(...args),
  findWithTodos: vi.fn().mockResolvedValue([]),
}));

const mockChatCompletion = vi.fn();
vi.mock("../ai/provider.js", () => ({
  chatCompletion: (...args: any[]) => mockChatCompletion(...args),
}));

// ── Import after mocks ────────────────────────────────────────────────

const { detectClosedLoops, matchTemplate } = await import("./decision-template.js");

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue([]);
  mockQueryOne.mockResolvedValue(null);
});

describe("场景 1: 检测完整决策闭环", () => {
  it("should_detect_completed_goal_with_todos_as_closed_loop", async () => {
    // 查找最近 archived/completed 的 goal
    mockQuery.mockResolvedValueOnce([
      {
        id: "g1",
        title: "评估供应商",
        status: "completed",
        completed_todos: "3",
        total_todos: "3",
      },
    ]);
    // 还没有对应模板
    mockQuery.mockResolvedValueOnce([]);

    const loops = await detectClosedLoops("user-1");

    expect(loops).toHaveLength(1);
    expect(loops[0].goalId).toBe("g1");
    expect(loops[0].title).toBe("评估供应商");
  });

  it("should_skip_goals_already_saved_as_templates", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: "g1", title: "评估供应商", status: "completed", completed_todos: "3", total_todos: "3" },
      ])
      // 已有模板（goal_id 匹配）
      .mockResolvedValueOnce([{ id: "tmpl-1", goal_id: "g1" }]);

    const loops = await detectClosedLoops("user-1");

    expect(loops).toHaveLength(0);
  });
});

describe("场景 2: 模板匹配", () => {
  it("should_find_matching_templates_by_keyword_similarity", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: "tmpl-1",
        title: "供应商评估",
        steps: JSON.stringify(["调研现有供应商", "约面谈", "对比报价", "做决定"]),
        outcome: "选了新供应商，降本15%",
      },
    ]);

    const matches = await matchTemplate("user-1", "要再做一次供应商评估");

    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe("供应商评估");
    expect(matches[0].steps).toHaveLength(4);
  });

  it("should_return_empty_when_no_templates", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const matches = await matchTemplate("user-1", "需要评估供应商");

    expect(matches).toHaveLength(0);
  });
});
