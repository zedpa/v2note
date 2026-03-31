/**
 * 统一搜索工具
 *
 * 合并 records/goals/todos/clusters 搜索为一个 search 工具，
 * 支持 filters（status/date/date_from/date_to/goal_id/domain）结构化过滤。
 */
import type { SearchParams, SearchResultItem } from "./types.js";
interface SearchContext {
    deviceId: string;
    userId?: string;
}
export declare function unifiedSearch(params: SearchParams, ctx: SearchContext): Promise<SearchResultItem[]>;
export {};
