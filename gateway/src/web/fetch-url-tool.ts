/**
 * fetch_url 工具定义
 */

import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolCallResult } from "../tools/types.js";
import { isUrlSafe } from "./url-safety.js";
import { extractUrl } from "../ingest/url-extractor.js";
import { toLocalDateTime } from "../lib/tz.js";

const MAX_CONTENT = 50000;

export const fetchUrlToolDef: ToolDefinition = {
  name: "fetch_url",
  description: `获取指定网页的内容。
    使用：用户分享了一个 URL 想让你看。
    使用：需要获取特定网页的详细内容。
    不用：用户只是想搜索信息 → 用 web_search。
    不用：URL 是系统内部链接（/goals/xxx）→ 用 search。`,
  parameters: z.object({
    url: z.string().describe("要抓取的网页 URL"),
  }),
  autonomy: "silent",

  async handler(args: { url: string }, _ctx: ToolContext): Promise<ToolCallResult> {
    if (!isUrlSafe(args.url)) {
      return {
        success: false,
        message: "此 URL 不允许访问（内网地址或非 HTTP 协议）",
      };
    }

    try {
      const result = await extractUrl(args.url);
      let content = result.content;
      let truncated = false;

      if (content.length > MAX_CONTENT) {
        content = content.slice(0, MAX_CONTENT);
        truncated = true;
      }

      return {
        success: true,
        message: `已获取页面内容（约 ${content.length} 字）${truncated ? "（内容已截断）" : ""}`,
        data: {
          title: result.title,
          content,
          word_count: content.length,
          url: args.url,
          fetched_at: toLocalDateTime(new Date()),
        },
        next_hint: "内容已获取。如需将此内容录入系统，后台会自动作为 material 保存。",
      };
    } catch (err: any) {
      return {
        success: false,
        message: `无法获取页面内容: ${err.message}`,
      };
    }
  },
};
