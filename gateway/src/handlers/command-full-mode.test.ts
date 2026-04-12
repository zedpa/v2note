import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("../db/repositories/index.js", () => ({
  todoRepo: {
    findPendingByUser: vi.fn(),
    findPendingByDevice: vi.fn(),
    findActiveGoalsByUser: vi.fn(),
    findActiveGoalsByDevice: vi.fn(),
    findByUser: vi.fn(),
    findByDevice: vi.fn(),
  },
  wikiPageRepo: {
    findAllActive: vi.fn(),
  },
  recordRepo: {
    updateStatus: vi.fn(),
  },
}));

vi.mock("../ai/provider.js", () => ({
  chatCompletion: vi.fn(),
}));

import { todoRepo, wikiPageRepo } from "../db/repositories/index.js";
import { chatCompletion } from "../ai/provider.js";
import { commandFullMode } from "./command-full-mode.js";

// ── Helpers ────────────────────────────────────────────────────────────

function mockTodo(id: string, text: string, overrides?: Record<string, any>) {
  return {
    id, text, done: false, record_id: "r1",
    estimated_minutes: null, scheduled_start: null, scheduled_end: null,
    priority: 0, completed_at: null, created_at: "2026-04-11",
    ...overrides,
  };
}

function mockGoal(id: string, text: string) {
  return { id, text, done: false, level: 1, status: "active", priority: 0 } as any;
}

function mockWikiPage(id: string, title: string) {
  return { id, title, level: 3, status: "active", user_id: "u1", page_type: "topic" } as any;
}

// ══════════════════════════════════════════════════════════════════════

describe("commandFullMode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (todoRepo.findPendingByDevice as any).mockResolvedValue([mockTodo("t1", "买牛奶")]);
    (todoRepo.findActiveGoalsByDevice as any).mockResolvedValue([mockGoal("g1", "健康")]);
    (todoRepo.findPendingByUser as any).mockResolvedValue([mockTodo("t1", "买牛奶")]);
    (todoRepo.findActiveGoalsByUser as any).mockResolvedValue([mockGoal("g1", "健康")]);
    (wikiPageRepo.findAllActive as any).mockResolvedValue([mockWikiPage("wp1", "工作")]);
  });

  it("should_return_commands_when_ai_returns_valid_create_todo", async () => {
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({
        commands: [{
          action_type: "create_todo",
          confidence: 0.95,
          todo: { text: "开会", scheduled_start: "2026-04-12T09:00:00", priority: 3 },
        }],
      }),
    });

    const result = await commandFullMode({ text: "明天九点开会", deviceId: "d1" });

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].action_type).toBe("create");
    expect(result.commands[0].todo?.text).toBe("开会");
  });

  it("should_return_commands_when_ai_returns_complete_todo_with_target_id", async () => {
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({
        commands: [{
          action_type: "complete_todo",
          confidence: 0.9,
          target_hint: "买牛奶",
          target_id: "t1",
        }],
      }),
    });

    const result = await commandFullMode({ text: "买牛奶搞定了", deviceId: "d1" });

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].action_type).toBe("complete");
    expect(result.commands[0].target_id).toBe("t1");
  });

  it("should_fallback_match_target_id_when_ai_returns_complete_without_target_id", async () => {
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({
        commands: [{
          action_type: "complete_todo",
          confidence: 0.9,
          target_hint: "牛奶",
        }],
      }),
    });

    const result = await commandFullMode({ text: "牛奶搞定了", deviceId: "d1" });

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].target_id).toBe("t1");
  });

  it("should_throw_when_ai_returns_empty_content", async () => {
    (chatCompletion as any).mockResolvedValue({ content: "" });

    await expect(commandFullMode({ text: "test", deviceId: "d1" })).rejects.toThrow("AI 返回空结果");
  });

  it("should_throw_when_ai_returns_invalid_json", async () => {
    (chatCompletion as any).mockResolvedValue({ content: "not json" });

    await expect(commandFullMode({ text: "test", deviceId: "d1" })).rejects.toThrow("AI 返回格式错误");
  });

  it("should_handle_query_todo_with_post_processing", async () => {
    (todoRepo.findPendingByUser as any).mockResolvedValue([
      mockTodo("t1", "买牛奶", { scheduled_start: "2026-04-12T09:00:00" }),
      mockTodo("t2", "开会", { scheduled_start: "2026-04-12T14:00:00" }),
      mockTodo("t3", "跑步", { scheduled_start: "2026-04-13T07:00:00" }),
    ]);

    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({
        commands: [{
          action_type: "query_todo",
          confidence: 0.95,
          query_params: { date: "2026-04-12" },
        }],
      }),
    });

    const result = await commandFullMode({ text: "明天有什么安排", deviceId: "d1" });

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].action_type).toBe("query");
    expect(result.commands[0].query_result).toBeDefined();
    expect(result.commands[0].query_result!.length).toBe(2);
  });

  it("should_return_empty_commands_when_ai_returns_no_commands", async () => {
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({ commands: [] }),
    });

    const result = await commandFullMode({ text: "啊啊啊", deviceId: "d1" });

    expect(result.commands).toHaveLength(0);
  });

  it("should_use_userId_repos_when_userId_is_provided", async () => {
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({ commands: [] }),
    });

    await commandFullMode({ text: "test", deviceId: "d1", userId: "u1" });

    expect(todoRepo.findPendingByUser).toHaveBeenCalledWith("u1");
    expect(todoRepo.findActiveGoalsByUser).toHaveBeenCalledWith("u1");
    expect(wikiPageRepo.findAllActive).toHaveBeenCalledWith("u1");
  });

  it("should_use_deviceId_as_userId_fallback_when_no_userId", async () => {
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({ commands: [] }),
    });

    await commandFullMode({ text: "test", deviceId: "d1" });

    // deviceId 不再使用 byDevice，而是作为 userId fallback
    expect(todoRepo.findPendingByUser).toHaveBeenCalledWith("d1");
    expect(todoRepo.findActiveGoalsByUser).toHaveBeenCalledWith("d1");
    expect(wikiPageRepo.findAllActive).toHaveBeenCalledWith("d1");
  });

  it("should_handle_multiple_commands_in_single_response", async () => {
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({
        commands: [
          { action_type: "complete_todo", confidence: 0.9, target_hint: "牛奶", target_id: "t1" },
          { action_type: "create_todo", confidence: 0.95, todo: { text: "找张总", scheduled_start: "2026-04-12T15:00:00", priority: 3 } },
        ],
      }),
    });

    const result = await commandFullMode({ text: "牛奶搞定了，明天3点找张总", deviceId: "d1" });

    expect(result.commands).toHaveLength(2);
    expect(result.commands[0].action_type).toBe("complete");
    expect(result.commands[1].action_type).toBe("create");
  });

  it("should_handle_create_record_command", async () => {
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({
        commands: [{
          action_type: "create_record",
          confidence: 0.9,
          record: { content: "今天心情很好，和朋友吃了火锅", notebook: "生活" },
        }],
      }),
    });

    const result = await commandFullMode({ text: "记一下今天心情很好和朋友吃了火锅", deviceId: "d1" });

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].action_type).toBe("create_record");
    expect(result.commands[0].record?.content).toContain("心情很好");
  });

  it("should_handle_manage_wiki_page_command", async () => {
    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({
        commands: [{
          action_type: "manage_wiki_page",
          confidence: 0.9,
          wiki_page: { action: "create", title: "旅行" },
        }],
      }),
    });

    const result = await commandFullMode({ text: "创建一个旅行主题", deviceId: "d1" });

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].action_type).toBe("manage_wiki_page");
    expect(result.commands[0].wiki_page?.action).toBe("create");
  });

  it("should_include_wiki_pages_in_prompt", async () => {
    (wikiPageRepo.findAllActive as any).mockResolvedValue([
      mockWikiPage("wp1", "工作"),
      mockWikiPage("wp2", "学习"),
    ]);

    (chatCompletion as any).mockResolvedValue({
      content: JSON.stringify({ commands: [] }),
    });

    await commandFullMode({ text: "test", deviceId: "d1", userId: "u1" });

    // 验证 chatCompletion 被调用时 prompt 包含 wiki pages
    const callArgs = (chatCompletion as any).mock.calls[0];
    const systemPrompt = callArgs[0][0].content;
    expect(systemPrompt).toContain("工作");
    expect(systemPrompt).toContain("学习");
  });
});
