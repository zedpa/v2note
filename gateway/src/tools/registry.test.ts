import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "./registry.js";
import type { ToolDefinition, ToolCallResult, ToolContext } from "./types.js";

// 创建一个测试用的 mock 工具
function createMockTool(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: "test_tool",
    description: "A test tool for unit testing.",
    parameters: z.object({ text: z.string() }),
    autonomy: "notify",
    handler: vi.fn().mockResolvedValue({
      success: true,
      message: "done",
      data: { id: "123" },
    }),
    ...overrides,
  };
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe("注册与发现", () => {
    it("should_register_tool_and_retrieve_by_name", () => {
      const tool = createMockTool();
      registry.register(tool);

      expect(registry.get("test_tool")).toBe(tool);
    });

    it("should_return_undefined_for_unregistered_tool", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("should_check_tool_existence_with_has", () => {
      registry.register(createMockTool());

      expect(registry.has("test_tool")).toBe(true);
      expect(registry.has("nonexistent")).toBe(false);
    });

    it("should_list_all_registered_tools", () => {
      registry.register(createMockTool({ name: "tool_a" }));
      registry.register(createMockTool({ name: "tool_b" }));
      registry.register(createMockTool({ name: "tool_c" }));

      const all = registry.getAll();
      expect(all).toHaveLength(3);
      expect(all.map((t) => t.name)).toEqual(["tool_a", "tool_b", "tool_c"]);
    });

    it("should_reject_duplicate_tool_names", () => {
      registry.register(createMockTool({ name: "dup_tool" }));
      expect(() => registry.register(createMockTool({ name: "dup_tool" }))).toThrow(
        /already registered/,
      );
    });
  });

  describe("工具执行", () => {
    it("should_execute_tool_handler_with_context", async () => {
      const handler = vi.fn().mockResolvedValue({
        success: true,
        message: "创建成功",
        data: { todo_id: "t1" },
        next_hint: "可以用 create_link 关联到目标",
      });
      registry.register(createMockTool({ handler }));

      const ctx: ToolContext = {
        deviceId: "d1",
        userId: "u1",
        sessionId: "s1",
      };
      const result = await registry.execute("test_tool", { text: "hello" }, ctx);

      expect(handler).toHaveBeenCalledWith({ text: "hello" }, ctx);
      expect(result.success).toBe(true);
      expect(result.next_hint).toBe("可以用 create_link 关联到目标");
    });

    it("should_return_error_for_unknown_tool", async () => {
      const ctx: ToolContext = { deviceId: "d1", sessionId: "s1" };
      const result = await registry.execute("unknown", {}, ctx);

      expect(result.success).toBe(false);
      expect(result.message).toContain("未知工具");
    });

    it("should_validate_args_with_zod_schema", async () => {
      const tool = createMockTool({
        parameters: z.object({
          text: z.string().min(1),
          priority: z.number().optional(),
        }),
      });
      registry.register(tool);

      const ctx: ToolContext = { deviceId: "d1", sessionId: "s1" };
      // 空 text 应该被 Zod 拒绝
      const result = await registry.execute("test_tool", { text: "" }, ctx);
      expect(result.success).toBe(false);
      expect(result.message).toContain("参数");
    });

    it("should_catch_handler_errors_gracefully", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("DB connection lost"));
      registry.register(createMockTool({ handler }));

      const ctx: ToolContext = { deviceId: "d1", sessionId: "s1" };
      const result = await registry.execute("test_tool", { text: "hello" }, ctx);

      expect(result.success).toBe(false);
      expect(result.message).toContain("DB connection lost");
    });
  });

  describe("自主度分级", () => {
    it("should_filter_tools_by_autonomy_level", () => {
      registry.register(createMockTool({ name: "search", autonomy: "silent" }));
      registry.register(createMockTool({ name: "create_todo", autonomy: "notify" }));
      registry.register(createMockTool({ name: "delete_record", autonomy: "confirm" }));

      const silent = registry.getByAutonomy("silent");
      expect(silent).toHaveLength(1);
      expect(silent[0].name).toBe("search");

      const confirm = registry.getByAutonomy("confirm");
      expect(confirm).toHaveLength(1);
      expect(confirm[0].name).toBe("delete_record");
    });

    it("should_report_autonomy_for_a_tool", () => {
      registry.register(createMockTool({ name: "delete_record", autonomy: "confirm" }));
      expect(registry.getAutonomy("delete_record")).toBe("confirm");
      expect(registry.getAutonomy("nonexistent")).toBeUndefined();
    });
  });

  describe("Vercel AI SDK 集成", () => {
    it("should_export_tools_as_ai_sdk_format", () => {
      registry.register(
        createMockTool({
          name: "create_todo",
          description: "创建待办",
          parameters: z.object({
            text: z.string(),
            priority: z.number().optional(),
          }),
        }),
      );

      const aiTools = registry.toAISDKTools();

      // Vercel AI SDK v6 tools 格式：{ [name]: { description, inputSchema, execute } }
      expect(aiTools).toHaveProperty("create_todo");
      expect(aiTools.create_todo).toHaveProperty("description", "创建待办");
      expect(aiTools.create_todo).toHaveProperty("inputSchema");
      expect(aiTools.create_todo).toHaveProperty("execute");
    });

    it("should_bind_context_to_ai_sdk_tool_execute", async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, message: "ok" });
      registry.register(createMockTool({ name: "my_tool", handler }));

      const ctx: ToolContext = { deviceId: "d1", userId: "u1", sessionId: "s1" };
      const aiTools = registry.toAISDKTools(ctx);

      // 模拟 AI SDK 调用 execute
      const executeFn = (aiTools.my_tool as any).execute;
      expect(executeFn).toBeDefined();
      await executeFn({ text: "hello" }, { toolCallId: 'tc1', messages: [] });

      expect(handler).toHaveBeenCalledWith({ text: "hello" }, ctx);
    });
  });
});
