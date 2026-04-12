/**
 * 编译阈值触发 — Phase 14.5
 *
 * 当 page 的 token_count 累积达到阈值时，异步触发编译。
 * 编译完成后重置 token_count = 0。
 */

import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import { compileWikiForUser } from "./wiki-compiler.js";

/** 触发编译的 token 阈值 */
export const COMPILE_THRESHOLD = 5000;

/**
 * 检查 page 的 token_count，如果 >= 阈值则触发编译。
 *
 * 支持两种调用模式：
 * 1. 传入 currentTokenCount（已知值，省一次 DB 查询）
 * 2. 不传（从 DB 查询）
 *
 * 编译失败不抛错（静默降级，等每日 3AM 全量编译兜底）
 */
export async function checkAndTriggerCompile(
  pageId: string,
  userId: string,
  currentTokenCount?: number,
): Promise<void> {
  try {
    let tokenCount = currentTokenCount;
    if (tokenCount === undefined) {
      const page = await wikiPageRepo.findById(pageId);
      if (!page) {
        console.warn(`[compile-trigger] page 不存在: ${pageId}`);
        return;
      }
      tokenCount = page.token_count;
    }

    if (tokenCount < COMPILE_THRESHOLD) {
      return;
    }

    console.log(
      `[compile-trigger] page ${pageId} token_count=${tokenCount} >= ${COMPILE_THRESHOLD}，触发编译`,
    );

    const tokensBefore = tokenCount;
    try {
      await compileWikiForUser(userId);
      await wikiPageRepo.decrementTokenCount(pageId, tokensBefore);
      console.log(`[compile-trigger] page ${pageId} 编译完成，token_count 减去 ${tokensBefore}`);
    } catch (err: any) {
      console.error(`[compile-trigger] 编译失败: ${err.message}`);
    }
  } catch (err: any) {
    console.error(`[compile-trigger] 检查失败: ${err.message}`);
  }
}
