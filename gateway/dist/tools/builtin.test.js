import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock all repository modules before importing the module under test
vi.mock("../db/repositories/index.js", () => ({
    recordRepo: {
        findById: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: "rec-1" }),
        updateStatus: vi.fn(),
    },
    transcriptRepo: { create: vi.fn() },
    summaryRepo: { create: vi.fn() },
    customSkillRepo: { findByDeviceAndName: vi.fn() },
    todoRepo: {
        create: vi.fn().mockResolvedValue({ id: "todo-1" }),
        update: vi.fn().mockResolvedValue(undefined),
    },
    goalRepo: {
        create: vi.fn().mockResolvedValue({ id: "goal-1" }),
    },
    pendingIntentRepo: {
        findById: vi.fn(),
        updateStatus: vi.fn(),
    },
    notebookRepo: {
        findOrCreate: vi.fn().mockResolvedValue({ id: "nb-1", name: "test-nb" }),
    },
}));
import { callBuiltinTool, isBuiltinTool, BUILTIN_TOOLS } from "./builtin.js";
import { todoRepo, notebookRepo } from "../db/repositories/index.js";
describe("builtin tools", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("isBuiltinTool", () => {
        it("recognizes all defined tools", () => {
            for (const tool of BUILTIN_TOOLS) {
                expect(isBuiltinTool(tool.name)).toBe(true);
            }
        });
        it("rejects unknown tools", () => {
            expect(isBuiltinTool("nonexistent_tool")).toBe(false);
        });
    });
    describe("update_todo tool", () => {
        it("is registered in BUILTIN_TOOLS", () => {
            const tool = BUILTIN_TOOLS.find((t) => t.name === "update_todo");
            expect(tool).toBeDefined();
            expect(tool.parameters).toBeDefined();
        });
        it("updates todo with scheduled_start and estimated_minutes", async () => {
            const result = await callBuiltinTool("update_todo", {
                todo_id: "todo-123",
                scheduled_start: "2026-03-15T10:00:00",
                estimated_minutes: 30,
            }, "device-1");
            expect(result.success).toBe(true);
            expect(result.message).toContain("todo-123");
            expect(todoRepo.update).toHaveBeenCalledWith("todo-123", {
                scheduled_start: "2026-03-15T10:00:00",
                estimated_minutes: 30,
            });
        });
        it("clears scheduled_start when empty string", async () => {
            const result = await callBuiltinTool("update_todo", {
                todo_id: "todo-123",
                scheduled_start: "",
            }, "device-1");
            expect(result.success).toBe(true);
            expect(todoRepo.update).toHaveBeenCalledWith("todo-123", {
                scheduled_start: null,
            });
        });
        it("fails without todo_id", async () => {
            const result = await callBuiltinTool("update_todo", {}, "device-1");
            expect(result.success).toBe(false);
            expect(result.message).toContain("todo_id");
        });
        it("fails with no update fields", async () => {
            const result = await callBuiltinTool("update_todo", { todo_id: "todo-123" }, "device-1");
            expect(result.success).toBe(false);
            expect(result.message).toContain("没有提供");
        });
        it("updates text and priority together", async () => {
            const result = await callBuiltinTool("update_todo", {
                todo_id: "todo-123",
                text: "New text",
                priority: 5,
            }, "device-1");
            expect(result.success).toBe(true);
            expect(todoRepo.update).toHaveBeenCalledWith("todo-123", {
                text: "New text",
                priority: 5,
            });
        });
    });
    describe("create_notebook tool", () => {
        it("is registered in BUILTIN_TOOLS", () => {
            const tool = BUILTIN_TOOLS.find((t) => t.name === "create_notebook");
            expect(tool).toBeDefined();
        });
        it("creates a notebook", async () => {
            const result = await callBuiltinTool("create_notebook", { name: "project-alpha", description: "Alpha project notes" }, "device-1");
            expect(result.success).toBe(true);
            expect(result.message).toContain("project-alpha");
            expect(notebookRepo.findOrCreate).toHaveBeenCalledWith("device-1", "project-alpha", "Alpha project notes", false, undefined);
        });
        it("fails without name", async () => {
            const result = await callBuiltinTool("create_notebook", {}, "device-1");
            expect(result.success).toBe(false);
        });
    });
    describe("create_todo tool with scheduling", () => {
        it("creates todo with scheduling fields", async () => {
            const result = await callBuiltinTool("create_todo", {
                text: "Meeting at 3pm",
                scheduled_start: "2026-03-15T15:00:00",
                scheduled_end: "2026-03-15T16:00:00",
                estimated_minutes: 60,
                priority: 3,
            }, "device-1");
            expect(result.success).toBe(true);
            expect(todoRepo.create).toHaveBeenCalled();
            expect(todoRepo.update).toHaveBeenCalledWith("todo-1", {
                scheduled_start: "2026-03-15T15:00:00",
                scheduled_end: "2026-03-15T16:00:00",
                estimated_minutes: 60,
                priority: 3,
            });
        });
    });
});
//# sourceMappingURL=builtin.test.js.map