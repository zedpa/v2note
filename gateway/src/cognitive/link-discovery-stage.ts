/**
 * Link 发现 — Phase 14.11 阶段 5
 *
 * 通过关键词匹配发现未被编译捕获的跨 page 关联：
 * 如果 page A 的 content 中包含 page B 的 title，则创建 'related' 类型的链接。
 *
 * 这是对编译阶段 AI 发现链接的补充（编译时 AI 已通过 links 指令创建了一部分链接）。
 *
 * 复杂度注意：O(N²) 两两比较。个人知识库通常 < 200 page 可接受。
 * 若 page 数超过 500，应改为批量 INSERT 或限制扫描范围（如只扫描近期有变化的 page）。
 */

import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageLinkRepo from "../db/repositories/wiki-page-link.js";

/** 最短 title 长度，低于此值跳过以避免误匹配 */
const MIN_TITLE_LENGTH = 2;

export interface LinkDiscoveryResult {
  linksCreated: number;
}

/**
 * 扫描所有 active page，通过关键词匹配发现跨 page 关联
 */
export async function discoverLinks(userId: string): Promise<LinkDiscoveryResult> {
  const result: LinkDiscoveryResult = { linksCreated: 0 };

  const pages = await wikiPageRepo.findAllActive(userId);

  if (pages.length < 2) {
    return result;
  }

  // 构建 title → page 索引（跳过过短 title）
  const titleIndex: Array<{ id: string; title: string }> = [];
  for (const page of pages) {
    if (page.title && page.title.length >= MIN_TITLE_LENGTH) {
      titleIndex.push({ id: page.id, title: page.title });
    }
  }

  // 遍历每个 page，在 content 中搜索其他 page 的 title
  for (const page of pages) {
    const content = page.content ?? "";
    if (!content) continue;

    for (const target of titleIndex) {
      // 跳过自引用
      if (target.id === page.id) continue;

      // 关键词匹配：content 中是否包含 target title
      if (content.includes(target.title)) {
        try {
          await wikiPageLinkRepo.createLink({
            source_page_id: page.id,
            target_page_id: target.id,
            link_type: "related",
            context_text: `page content 提及了 "${target.title}"`,
          });
          result.linksCreated++;
        } catch (err: any) {
          console.warn(`[link-discovery] 创建链接失败 ${page.id} → ${target.id}: ${err.message}`);
        }
      }
    }
  }

  return result;
}
