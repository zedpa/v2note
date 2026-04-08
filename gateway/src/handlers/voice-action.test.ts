import { describe, it, expect, vi, beforeEach } from "vitest";
import { daysLater } from "../lib/tz.js";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("../db/repositories/index.js", () => ({
  todoRepo: {
    findPendingByUser: vi.fn(),
    findPendingByDevice: vi.fn(),
    update: vi.fn(),
    createMany: vi.fn(),
  },
  goalRepo: {
    findActiveByUser: vi.fn(),
    findActiveByDevice: vi.fn(),
  },
  recordRepo: {
    searchByUser: vi.fn(),
    search: vi.fn(),
  },
}));

vi.mock("../ai/provider.js", () => ({
  chatCompletion: vi.fn(),
}));

import { todoRepo, goalRepo } from "../db/repositories/index.js";

// ── Helpers ────────────────────────────────────────────────────────────

function mockTodo(id: string, text: string, overrides?: Record<string, any>) {
  return {
    id,
    record_id: "r1",
    text,
    done: false,
    estimated_minutes: null,
    scheduled_start: null,
    scheduled_end: null,
    priority: 0,
    completed_at: null,
    created_at: "2026-03-26",
    goal_id: null,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 场景 1: 意图分类 — 记录型不触发 action
// ══════════════════════════════════════════════════════════════════════

describe("场景 1: classifyVoiceIntent — 记录型", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_classify_as_record_when_no_action_intent", async () => {
    const { classifyVoiceIntent } = await import("./voice-action.js");
    const { chatCompletion } = await import("../ai/provider.js");

    // v2: 全部走 AI 分类，AI 判断为 record
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({ type: "record", record_text: "", actions: [] }),
    });

    const result = await classifyVoiceIntent("今天和张总开会，他说原材料涨了15%");

    expect(result.type).toBe("record");
    expect(result.actions).toHaveLength(0);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 2: 意图分类 — 指令型修改待办
// ══════════════════════════════════════════════════════════════════════

describe("场景 2: classifyVoiceIntent — 指令型 modify_todo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_classify_as_action_when_modify_intent_detected", async () => {
    const { classifyVoiceIntent } = await import("./voice-action.js");
    const { chatCompletion } = await import("../ai/provider.js");

    vi.mocked(chatCompletion).mockResolvedValueOnce({
      content: JSON.stringify({
        type: "action",
        actions: [{
          type: "modify_todo",
          confidence: 0.95,
          target_hint: "打给张总",
          changes: { scheduled_start: "2026-03-27T15:00" },
          risk_level: "low",
          original_text: "把打给张总那个改到明天下午三点",
        }],
      }),
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });

    const result = await classifyVoiceIntent("把打给张总那个改到明天下午三点");

    expect(result.type).toBe("action");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("modify_todo");
    expect(result.actions[0].target_hint).toBe("打给张总");
    expect(result.actions[0].confidence).toBeGreaterThanOrEqual(0.7);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 3: 意图分类 — 混合型（记录 + 指令）
// ══════════════════════════════════════════════════════════════════════

describe("场景 3: classifyVoiceIntent — 混合型", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_classify_as_mixed_when_record_and_action_both_present", async () => {
    const { classifyVoiceIntent } = await import("./voice-action.js");
    const { chatCompletion } = await import("../ai/provider.js");

    vi.mocked(chatCompletion).mockResolvedValueOnce({
      content: JSON.stringify({
        type: "mixed",
        record_text: "开会说了涨价",
        actions: [{
          type: "create_todo",
          confidence: 0.9,
          target_hint: "",
          changes: { text: "明天问张总报价", scheduled_start: "2026-03-27" },
          risk_level: "low",
          original_text: "提醒我明天问张总报价",
        }],
      }),
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });

    const result = await classifyVoiceIntent("开会说了涨价，提醒我明天问张总报价");

    expect(result.type).toBe("mixed");
    expect(result.record_text).toBeTruthy();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("create_todo");
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 4: 模糊匹配待办
// ══════════════════════════════════════════════════════════════════════

describe("场景 4: matchTodoByHint — 模糊匹配", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_match_todo_by_keyword", async () => {
    const { matchTodoByHint } = await import("./voice-action.js");

    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
      mockTodo("t1", "打给张总确认铝材报价"),
      mockTodo("t2", "审阅小李成本对比"),
      mockTodo("t3", "完成产品评审"),
    ]);

    const match = await matchTodoByHint("张总", { userId: "u1", deviceId: "d1" });

    expect(match).not.toBeNull();
    expect(match!.id).toBe("t1");
  });

  it("should_return_null_when_no_match", async () => {
    const { matchTodoByHint } = await import("./voice-action.js");

    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
      mockTodo("t1", "打给张总确认铝材报价"),
    ]);

    const match = await matchTodoByHint("李总", { userId: "u1", deviceId: "d1" });

    expect(match).toBeNull();
  });

  it("should_match_partial_keywords", async () => {
    const { matchTodoByHint } = await import("./voice-action.js");

    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
      mockTodo("t1", "打给张总确认铝材报价"),
      mockTodo("t2", "完成产品评审文档"),
    ]);

    // "评审" 应匹配到 "完成产品评审文档"
    const match = await matchTodoByHint("评审", { userId: "u1", deviceId: "d1" });

    expect(match).not.toBeNull();
    expect(match!.id).toBe("t2");
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 5: 执行指令 — modify_todo
// ══════════════════════════════════════════════════════════════════════

describe("场景 5: executeVoiceAction — modify_todo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_modify_matched_todo", async () => {
    const { executeVoiceAction } = await import("./voice-action.js");

    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
      mockTodo("t1", "打给张总确认铝材报价"),
    ]);
    vi.mocked(todoRepo.update).mockResolvedValue(undefined);

    const result = await executeVoiceAction(
      {
        type: "modify_todo",
        confidence: 0.95,
        target_hint: "张总",
        changes: { scheduled_start: "2026-03-27T15:00" },
        risk_level: "low",
        original_text: "把张总那个改到明天下午三点",
      },
      { userId: "u1", deviceId: "d1" },
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe("modify_todo");
    expect(result.todo_id).toBe("t1");
    expect(todoRepo.update).toHaveBeenCalledWith("t1", expect.objectContaining({
      scheduled_start: "2026-03-27T15:00",
    }));
  });

  it("should_fail_when_no_todo_matched", async () => {
    const { executeVoiceAction } = await import("./voice-action.js");

    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
      mockTodo("t1", "打给张总确认铝材报价"),
    ]);

    const result = await executeVoiceAction(
      {
        type: "modify_todo",
        confidence: 0.95,
        target_hint: "李总",
        changes: { scheduled_start: "2026-03-27T15:00" },
        risk_level: "low",
        original_text: "把李总那个改到明天",
      },
      { userId: "u1", deviceId: "d1" },
    );

    expect(result.success).toBe(false);
    expect(result.summary).toContain("没找到");
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 6: 执行指令 — complete_todo
// ══════════════════════════════════════════════════════════════════════

describe("场景 6: executeVoiceAction — complete_todo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_complete_matched_todo", async () => {
    const { executeVoiceAction } = await import("./voice-action.js");

    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
      mockTodo("t1", "打给张总确认铝材报价"),
    ]);
    vi.mocked(todoRepo.update).mockResolvedValue(undefined);

    const result = await executeVoiceAction(
      {
        type: "complete_todo",
        confidence: 0.9,
        target_hint: "张总",
        changes: {},
        risk_level: "low",
        original_text: "张总的电话打了",
      },
      { userId: "u1", deviceId: "d1" },
    );

    expect(result.success).toBe(true);
    expect(todoRepo.update).toHaveBeenCalledWith("t1", expect.objectContaining({
      done: true,
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 7: 执行指令 — query_todo
// ══════════════════════════════════════════════════════════════════════

describe("场景 7: executeVoiceAction — query_todo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_return_matching_todos_for_query", async () => {
    const { executeVoiceAction } = await import("./voice-action.js");

    const tomorrowStr = daysLater(1);

    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
      mockTodo("t1", "联系新供应商", { scheduled_start: `${tomorrowStr}T09:00` }),
      mockTodo("t2", "产品评审会", { scheduled_start: `${tomorrowStr}T15:00` }),
      mockTodo("t3", "写周报", { scheduled_start: null }), // 无日期，不匹配明天
    ]);

    const result = await executeVoiceAction(
      {
        type: "query_todo",
        confidence: 0.9,
        target_hint: "",
        query_params: { date: "tomorrow" },
        risk_level: "low",
        original_text: "我明天有什么安排",
      },
      { userId: "u1", deviceId: "d1" },
    );

    expect(result.success).toBe(true);
    expect(result.items).toBeDefined();
    expect(result.items!.length).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 8: 高风险操作 — delete_todo 返回 needs_confirm
// ══════════════════════════════════════════════════════════════════════

describe("场景 8: executeVoiceAction — delete_todo (high risk)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_return_needs_confirm_for_high_risk_action", async () => {
    const { executeVoiceAction } = await import("./voice-action.js");

    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
      mockTodo("t1", "周五评审会"),
    ]);

    const result = await executeVoiceAction(
      {
        type: "delete_todo",
        confidence: 0.9,
        target_hint: "评审会",
        changes: {},
        risk_level: "high",
        original_text: "取消周五的评审会",
      },
      { userId: "u1", deviceId: "d1" },
    );

    expect(result.success).toBe(false);
    expect(result.needs_confirm).toBe(true);
    expect(result.confirm_summary).toContain("评审会");
    // 此时不应该执行删除
    expect(todoRepo.update).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 9: 置信度低时降级
// ══════════════════════════════════════════════════════════════════════

describe("场景 9: 置信度低降级", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_skip_action_when_confidence_below_threshold", async () => {
    const { executeVoiceAction } = await import("./voice-action.js");

    const result = await executeVoiceAction(
      {
        type: "modify_todo",
        confidence: 0.5, // 低于 0.7 阈值
        target_hint: "张总",
        changes: { scheduled_start: "2026-03-27T15:00" },
        risk_level: "low",
        original_text: "那个张总的事",
      },
      { userId: "u1", deviceId: "d1" },
    );

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    // 不应调用任何 DB 操作
    expect(todoRepo.findPendingByUser).not.toHaveBeenCalled();
    expect(todoRepo.update).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 10: 追加备注到待办
// ══════════════════════════════════════════════════════════════════════

describe("场景 10: modify_todo 追加备注", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should_append_note_to_todo_text", async () => {
    const { executeVoiceAction } = await import("./voice-action.js");

    vi.mocked(todoRepo.findPendingByUser).mockResolvedValue([
      mockTodo("t1", "打给张总确认铝材报价"),
    ]);
    vi.mocked(todoRepo.update).mockResolvedValue(undefined);

    const result = await executeVoiceAction(
      {
        type: "modify_todo",
        confidence: 0.95,
        target_hint: "张总",
        changes: {
          scheduled_start: "2026-03-27T15:00",
          append_note: "问他最新报价",
        },
        risk_level: "low",
        original_text: "把张总那个改到明天三点，加个备注问他最新报价",
      },
      { userId: "u1", deviceId: "d1" },
    );

    expect(result.success).toBe(true);
    expect(todoRepo.update).toHaveBeenCalledWith("t1", expect.objectContaining({
      text: expect.stringContaining("问他最新报价"),
    }));
  });
});
