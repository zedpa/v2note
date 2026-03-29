import { z } from "zod";
import { unifiedSearch } from "../search.js";
export const searchTool = {
    name: "search",
    description: `在系统中搜索信息——日记、目标、待办。
使用：用户要查找已有内容（"找一下"、"有没有关于"、"上次说的"）。
使用：执行其他操作前需要先找到目标对象（如修改前先搜索）。
不用：用户要搜索互联网信息 → 用 web_search。`,
    parameters: z.object({
        query: z.string().min(1).describe("搜索关键词"),
        scope: z.enum(["all", "records", "goals", "todos", "clusters"]).default("all")
            .describe("搜索范围：all=全部, records=日记, goals=目标, todos=待办"),
        time_range: z.object({
            from: z.string(),
            to: z.string(),
        }).optional().describe("可选：时间范围"),
        limit: z.number().min(1).max(50).default(10).describe("返回数量上限"),
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