/**
 * 工具定义汇总 + 注册
 *
 * 所有内置工具在此注册到 ToolRegistry。
 * web_search / fetch_url 在 agent-web-tools 实现后补充。
 */

import { ToolRegistry } from "../registry.js";
import { createRecordTool } from "./create-record.js";
import { createTodoTool } from "./create-todo.js";
import { updateTodoTool } from "./update-todo.js";
import { createGoalTool } from "./create-goal.js";
import { updateGoalTool } from "./update-goal.js";
import { updateRecordTool } from "./update-record.js";
import { deleteRecordTool } from "./delete-record.js";
import { createProjectTool } from "./create-project.js";
import { createLinkTool } from "./create-link.js";
import { searchTool } from "./search.js";
import { confirmTool } from "./confirm.js";

/** 所有内置工具定义列表 */
export const ALL_TOOL_DEFINITIONS = [
  // CRUD
  createRecordTool,
  createTodoTool,
  updateTodoTool,
  createGoalTool,
  updateGoalTool,
  updateRecordTool,
  deleteRecordTool,
  createProjectTool,
  // 链接
  createLinkTool,
  // 搜索
  searchTool,
  // 系统
  confirmTool,
  // web_search, fetch_url — 待 agent-web-tools 实现
];

/** 创建并初始化全量工具注册表 */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of ALL_TOOL_DEFINITIONS) {
    registry.register(tool);
  }
  return registry;
}
