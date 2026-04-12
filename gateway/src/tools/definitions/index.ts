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
import { deleteTodoTool } from "./delete-todo.js";
import { createProjectTool } from "./create-project.js";
import { searchTool } from "./search.js";
import { confirmTool } from "./confirm.js";
import { getCurrentTimeTool } from "./get-current-time.js";
import { viewTool } from "./view.js";
import { saveConversationTool } from "./save-conversation.js";
import { updateSoulTool } from "./update-soul.js";
import { updateProfileTool } from "./update-profile-tool.js";
import { updateUserAgentTool } from "./update-user-agent-tool.js";
import { createMemoryTool } from "./create-memory-tool.js";
import { sendNotificationTool } from "./send-notification-tool.js";
import { manageWikiPageTool } from "./manage-wiki-page.js";
import { webSearchToolDef } from "../../web/web-search-tool.js";
import { fetchUrlToolDef } from "../../web/fetch-url-tool.js";
import { getSearchProvider } from "../../web/search-provider.js";

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
  deleteTodoTool,
  createProjectTool,
  // 搜索
  searchTool,
  // 统一查看
  viewTool,
  // 自我维护工具（AI 对话中自主调用）
  updateSoulTool,
  updateProfileTool,
  updateUserAgentTool,
  createMemoryTool,
  sendNotificationTool,
  // 对话保存
  saveConversationTool,
  // 主题管理（wiki page）
  manageWikiPageTool,
  // 系统
  confirmTool,
  getCurrentTimeTool,
];

/** 创建并初始化全量工具注册表（含条件注册的 web 工具） */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of ALL_TOOL_DEFINITIONS) {
    registry.register(tool);
  }

  // 条件注册联网工具：有 API key 才注册 web_search
  if (getSearchProvider()) {
    registry.register(webSearchToolDef);
  }
  // fetch_url 始终注册（不依赖外部 API）
  registry.register(fetchUrlToolDef);

  return registry;
}
