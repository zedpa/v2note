/**
 * @路由语法解析器 — Phase 14.3
 *
 * 解析用户日记中的 @domain/subdomain 语法，提取 target_path，
 * 自动创建不存在的 page，立即建立 wiki_page_record 关联。
 */
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../db/repositories/wiki-page-record.js";
import type { WikiPage } from "../db/repositories/wiki-page.js";
import { estimateTokens } from "./lightweight-classifier.js";
import { checkAndTriggerCompile } from "./compile-trigger.js";

/** @路由正则 — 匹配中文/英文/数字/下划线/斜杠 */
const AT_ROUTE_REGEX = /@([\u4e00-\u9fa5a-zA-Z0-9_/]+)/g;

/**
 * 从文本中解析 @路由，返回第一个匹配的 target_path。
 * 多个 @ 引用只取第一个（一条日记归属一个主 page）。
 */
export function parseAtRoute(text: string): string | null {
  if (!text) return null;
  const regex = new RegExp(AT_ROUTE_REGEX.source, AT_ROUTE_REGEX.flags);
  const match = regex.exec(text);
  if (!match) return null;
  // 去除尾部斜杠
  return match[1].replace(/\/+$/, "") || null;
}

/**
 * 确保 page 路径存在，不存在则自动创建。
 *
 * - "工作" → 确保 L3 "工作" page 存在
 * - "工作/采购" → 确保 L3 "工作" 和 L2 "采购" 都存在
 * - 自动创建的 page 标记 created_by='user'（用户主动指定的路径）
 *
 * 返回最终目标 page（叶子节点）。
 */
export async function ensurePagePath(
  userId: string,
  targetPath: string,
): Promise<WikiPage> {
  const parts = targetPath.split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid target_path: "${targetPath}"`);
  }

  const domainTitle = parts[0];

  // 查找或创建 L3 page
  const roots = await wikiPageRepo.findRoots(userId);
  let l3Page = roots.find((p) => p.title === domainTitle) ?? null;

  if (!l3Page) {
    l3Page = await wikiPageRepo.create({
      user_id: userId,
      title: domainTitle,
      level: 3,
      created_by: "user",
    });
  }

  // 如果只有 L3 层级，直接返回
  if (parts.length === 1) {
    return l3Page;
  }

  // 查找或创建 L2 page（子域）
  const subTitle = parts[1];
  const children = await wikiPageRepo.findByParent(l3Page.id);
  let l2Page = children.find((p) => p.title === subTitle) ?? null;

  if (!l2Page) {
    l2Page = await wikiPageRepo.create({
      user_id: userId,
      title: subTitle,
      level: 2,
      parent_id: l3Page.id,
      created_by: "user",
    });
  }

  return l2Page;
}

/** processAtRoute 返回结果 */
export interface AtRouteResult {
  targetPath: string;
  pageId: string;
}

/**
 * 完整的 @路由处理流程：
 * 1. 解析文本中的 @路由
 * 2. 确保目标 page 存在
 * 3. 建立 wiki_page_record 关联
 * 4. 返回 target_path 和 page_id（供调用方写入 record.metadata）
 *
 * 如果没有 @路由，返回 null。
 */
export async function processAtRoute(
  userId: string,
  recordId: string,
  text: string,
): Promise<AtRouteResult | null> {
  const targetPath = parseAtRoute(text);
  if (!targetPath) return null;

  const page = await ensurePagePath(userId, targetPath);

  // 立即建立关联（不等编译）
  await wikiPageRecordRepo.link(page.id, recordId);

  // 更新 token_count（返回新值）并检查编译阈值（Phase 14.5）
  const tokenCount = estimateTokens(text);
  const newTokenCount = await wikiPageRepo.incrementTokenCount(page.id, tokenCount);
  // fire-and-forget: 异步检查是否触发编译（传入已知 token_count 省一次查询）
  void checkAndTriggerCompile(page.id, userId, newTokenCount).catch((e) =>
    console.warn(`[at-route] 编译触发检查失败:`, e),
  );

  return {
    targetPath,
    pageId: page.id,
  };
}
