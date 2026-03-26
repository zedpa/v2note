/**
 * web_search 工具定义
 */

import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolCallResult } from "../tools/types.js";
import { getSearchProvider } from "./search-provider.js";

export const webSearchToolDef: ToolDefinition = {
  name: "web_search",
  description: `联网搜索最新信息。
    使用：用户问到需要实时数据的问题（价格、新闻、最新政策）。
    使用：用户明确要求"帮我搜一下"、"查查看"。
    不用：用户问的是系统内已有的信息 → 用 search。
    不用：用户给了具体 URL → 用 fetch_url。`,
  parameters: z.object({
    query: z.string().describe("搜索关键词"),
    max_results: z.number().optional().default(5).describe("最大结果数"),
  }),
  autonomy: "silent",

  async handler(args: { query: string; max_results?: number }, _ctx: ToolContext): Promise<ToolCallResult> {
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
    } catch (err: any) {
      return {
        success: false,
        message: `搜索暂时不可用: ${err.message}`,
      };
    }
  },
};
