/**
 * web_search 工具定义
 */
import { z } from "zod";
import { getSearchProvider } from "./search-provider.js";
export const webSearchToolDef = {
    name: "web_search",
    description: `联网搜索最新信息。
    使用：用户问到需要实时数据的问题（天气、价格、新闻、最新政策、技术问答）。
    使用：用户明确要求"帮我搜一下"、"查查看"、"搜索一下"。
    不用：用户问的是系统内已有的信息 → 用 search。
    不用：用户给了具体 URL → 用 fetch_url。
    重要：搜索后务必用 fetch_url 访问 1-2 个最相关的结果链接获取完整内容，再据此给出准确回答。不要仅凭搜索摘要就作答。`,
    parameters: z.object({
        query: z.string().describe("搜索关键词"),
        max_results: z.number().optional().default(5).describe("最大结果数"),
    }),
    autonomy: "silent",
    async handler(args, _ctx) {
        const provider = getSearchProvider();
        if (!provider) {
            return {
                success: false,
                message: "联网搜索未启用（未配置搜索服务 API key）",
            };
        }
        try {
            const results = await provider.search(args.query, args.max_results ?? 5);
            return {
                success: true,
                message: `找到 ${results.length} 条搜索结果`,
                data: { results },
                next_hint: "如需查看某个结果的完整内容，可用 fetch_url 获取",
            };
        }
        catch (err) {
            return {
                success: false,
                message: `搜索暂时不可用: ${err.message}`,
            };
        }
    },
};
//# sourceMappingURL=web-search-tool.js.map