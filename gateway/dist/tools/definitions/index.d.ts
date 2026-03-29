/**
 * 工具定义汇总 + 注册
 *
 * 所有内置工具在此注册到 ToolRegistry。
 * web_search / fetch_url 在 agent-web-tools 实现后补充。
 */
import { ToolRegistry } from "../registry.js";
/** 所有内置工具定义列表 */
export declare const ALL_TOOL_DEFINITIONS: import("../types.js").ToolDefinition[];
/** 创建并初始化全量工具注册表（含条件注册的 web 工具） */
export declare function createDefaultRegistry(): ToolRegistry;
