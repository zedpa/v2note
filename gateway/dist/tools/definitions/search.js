import { z } from "zod";
import { unifiedSearch } from "../search.js";
export const searchTool = {
    name: "search",
    description: `在系统中搜索日记、目标、待办。
使用：用户要查找已有内容（"找一下"、"有没有关于"、"上次说的"）。
使用：按日期浏览日记列表（query 留空 + filters.date）。
使用：搜索 AI 记忆（scope: "memories"）。
不用：要看某条记录的完整内容 → 用 view。
不用：用户要搜索互联网信息 → 用 web_search。`,
    parameters: z.object({
        query: z.string().default("").describe("搜索关键词，留空表示按日期/条件浏览"),
        scope: z.enum(["all", "records", "goals", "todos", "memories"]).default("all")
            .describe("搜索范围：all=全部, records=日记, goals=目标, todos=待办, memories=记忆"),
        filters: z.object({
            status: z.enum(["active", "completed", "all"]).optional()
                .describe("状态过滤：active=未完成, completed=已完成, all=全部（默认 active）"),
            date: z.string().optional()
                .describe("日期快捷键：today/tomorrow/yesterday 或 ISO 日期 2026-03-29，过滤 scheduled_start"),
            date_from: z.string().optional().describe("时间范围起始（ISO 日期）"),
            date_to: z.string().optional().describe("时间范围结束（ISO 日期）"),
            goal_id: z.string().optional().describe("过滤属于指定目标（parent_id）的待办"),
            domain: z.string().optional().describe("按领域过滤（工作/生活/学习等）"),
            include_ai_diary: z.boolean().optional()
                .describe("是否包含 AI 日报摘要（仅 scope=records 且有日期过滤时生效）"),
        }).optional().describe("可选：结构化过滤条件"),
        time_range: z.object({
            from: z.string(),
            to: z.string(),
        }).optional().describe("可选：时间范围（兼容保留，优先使用 filters.date_from/date_to）"),
        limit: z.number().min(1).max(100).default(10).describe("返回数量上限（浏览模式建议设大）"),
    }),
    autonomy: "silent",
    handler: async (args, ctx) => {
        const results = await unifiedSearch(args, {
            deviceId: ctx.deviceId,
            userId: ctx.userId,
        });
        if (results.length === 0) {
            return {
                success: true,
                message: `未找到与"${args.query}"相关的内容`,
                data: { results: [] },
            };
        }
        return {
            success: true,
            message: `找到 ${results.length} 个匹配结果`,
            data: { results },
            next_hint: "若要操作其中某一项，使用对应的 update 工具并传入 id",
        };
    },
};
//# sourceMappingURL=search.js.map