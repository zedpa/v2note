/**
 * topics 路由 — 基于 wiki_page 的主题列表和生命周期
 *
 * Phase 5 改造：数据源从 Cluster/Strike 切换到 wiki_page。
 * - GET /api/v1/topics → 从 wiki_page 表查询
 * - GET /api/v1/topics/:id/lifecycle → 从 wiki_page + goal + todo 查询
 * - POST /api/v1/goals/:id/harvest → 标记目标完成（编译时 AI 写入 wiki）
 */
import type { Router } from "../router.js";
export declare function registerTopicRoutes(router: Router): void;
