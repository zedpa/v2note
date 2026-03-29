/**
 * 统一搜索工具
 *
 * 合并 records/goals/todos/clusters 搜索为一个 search 工具，
 * LLM 只需选 scope 参数即可，降低工具选择压力。
 */
import type { SearchParams, SearchResultItem } from "./types.js";
interface SearchContext {
    deviceId: string;
    userId?: string;
}
/**
 * 统一搜索 — 跨 records/goals/todos 搜索
 * clusters 搜索预留，待 cluster repository 完善后接入
 */
export declare function unifiedSearch(params: SearchParams, ctx: SearchContext): Promise<SearchResultItem[]>;
export {};
