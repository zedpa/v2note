/**
 * 轻量 AI 分类器 — Phase 14.4
 *
 * 当日记没有 @路由时，异步调用 haiku 级模型将 Record 归属到合适的 wiki page。
 * 分类非关键路径，失败时静默忽略，等编译时再分类。
 */

import { generateStructured, type ChatMessage } from "../ai/provider.js";
import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../db/repositories/wiki-page-record.js";
import { recordRepo } from "../db/repositories/index.js";
import { checkAndTriggerCompile } from "./compile-trigger.js";
import { z } from "zod";

/** AI 返回的分类结果 schema */
const ClassifyResultSchema = z.object({
  domain_title: z.string().describe("归属的 L3 page 标题（已有或建议新建）"),
  page_title: z.string().optional().describe("更具体的 L2 归属（可选）"),
});

export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;

/** 粗略估算文本 token 数：中文 1 字 ≈ 2 tokens，ASCII 按空格分词 ≈ 1.3 tokens/word */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    if (char.charCodeAt(0) > 0x7f) {
      // 非 ASCII（中文等）: 约 2 tokens/字
      tokens += 2;
    } else if (char === " " || char === "\n" || char === "\t") {
      // 空白字符：大约 0.3 token（空格本身不产生 token，但分隔单词）
      tokens += 0.3;
    } else {
      // ASCII 字符：约 0.25 token/字符（~4 chars/token 英文）
      tokens += 0.25;
    }
  }
  return Math.max(1, Math.round(tokens));
}

/** 截断文本到 maxChars 字符（确保 token 预算在 500 内） */
export function truncateText(text: string, maxChars = 200): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/** 构建分类 prompt 的 page 列表 */
export function buildPageList(pages: Array<{ id: string; title: string; level: number; parent_id: string | null }>): string {
  if (pages.length === 0) return "（暂无已有页面）";

  const lines: string[] = [];
  // 先列 L3（顶层），再列 L2（子域）
  const l3Pages = pages.filter(p => p.level === 3);
  for (const l3 of l3Pages) {
    lines.push(`- ${l3.title}`);
    const children = pages.filter(p => p.parent_id === l3.id && p.level === 2);
    for (const child of children) {
      lines.push(`  - ${l3.title}/${child.title}`);
    }
  }
  // 独立 L2（没有 parent 在列表中的）
  const orphanL2 = pages.filter(p => p.level === 2 && !l3Pages.some(l3 => l3.id === p.parent_id));
  for (const p of orphanL2) {
    lines.push(`- (子页) ${p.title}`);
  }
  return lines.join("\n");
}

/**
 * 异步轻量分类：将 Record 归属到合适的 wiki page。
 *
 * - 使用 fast tier（haiku 级别，便宜快速）
 * - token 预算：输入 < 500，输出 < 100
 * - 失败时静默忽略（分类非关键路径）
 */
export async function classifyRecord(
  recordId: string,
  text: string,
  userId: string,
): Promise<void> {
  // 0. 如果 record 已有 wiki_page_record 关联（由 process.ts 即时归类），跳过分类
  // process.ts 已完成 incrementTokenCount + checkAndTriggerCompile，这里直接返回
  const existingLinks = await wikiPageRecordRepo.findPagesByRecord(recordId);
  if (existingLinks.length > 0) {
    return;
  }

  // 1. 获取所有现有 page
  const allPages = await wikiPageRepo.findAllActive(userId);

  // 2. 准备 prompt
  const truncated = truncateText(text, 200);
  const pageList = buildPageList(allPages);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是一个日记分类助手。根据日记内容，判断它属于哪个主题领域。
返回 JSON：{ "domain_title": "主题名", "page_title": "子主题名(可选)" }

已有的主题页面：
${pageList}

规则：
- domain_title 是 L3 顶层主题（如"工作"、"学习"、"健康"）
- 如果已有页面能匹配，优先用已有页面的 title（精确匹配）
- 如果没有合适的已有页面，可以建议一个新主题名
- page_title 是更具体的 L2 子主题（可选，如"采购"、"React"）
- 主题名应简洁（2-6 字）`,
    },
    {
      role: "user",
      content: truncated,
    },
  ];

  // 3. AI 调用（fast tier = 便宜快速模型）
  const { object: result } = await generateStructured<ClassifyResult>(
    messages,
    ClassifyResultSchema,
    {
      tier: "fast",
      temperature: 0.3,
      schemaName: "ClassifyResult",
      schemaDescription: "日记轻量分类结果",
    },
  );

  // 4. 匹配或创建 page
  const pageId = await resolvePageFromClassification(userId, result, allPages);

  // 5. 建立关联
  await wikiPageRecordRepo.link(pageId, recordId);

  // 6. 更新 token_count（返回更新后的值，传给 compile-trigger 省一次查询）
  const tokenDelta = estimateTokens(text);
  const newTokenCount = await wikiPageRepo.incrementTokenCount(pageId, tokenDelta);

  // 7. 检查编译阈值（Phase 14.5 — fire-and-forget，传入已知 token_count）
  void checkAndTriggerCompile(pageId, userId, newTokenCount).catch((e) =>
    console.warn(`[classifier] 编译触发检查失败:`, e),
  );

  // 8. 将分类路径写入 record.metadata
  const classifiedPath = result.page_title
    ? `${result.domain_title}/${result.page_title}`
    : result.domain_title;
  await recordRepo.mergeMetadata(recordId, { classified_path: classifiedPath });
}

/**
 * 根据 AI 分类结果解析目标 page ID。
 * - 匹配已有 L3 → 返回该 page
 * - 匹配已有 L2 → 返回该 page
 * - 新 domain → 创建 L3 page（created_by='ai'），带并发保护
 * - 有 page_title → 尝试匹配或创建 L2，带并发保护
 */
export async function resolvePageFromClassification(
  userId: string,
  result: ClassifyResult,
  allPages: Array<{ id: string; title: string; level: number; parent_id: string | null }>,
): Promise<string> {
  const { domain_title, page_title } = result;

  // 匹配已有 L3 page
  let l3Page = allPages.find(p => p.level === 3 && p.title === domain_title);

  if (!l3Page) {
    // 并发安全：findOrCreate — 先尝试创建，冲突时回退查询
    l3Page = await findOrCreatePage(userId, {
      title: domain_title,
      level: 3,
      created_by: "ai",
    });
  }

  // 如果有 page_title，尝试匹配或创建 L2
  if (page_title) {
    const l2Page = allPages.find(
      p => p.level === 2 && p.title === page_title && p.parent_id === l3Page!.id,
    );
    if (l2Page) {
      return l2Page.id;
    }
    // 并发安全：findOrCreate L2
    const createdL2 = await findOrCreatePage(userId, {
      title: page_title,
      level: 2,
      parent_id: l3Page.id,
      created_by: "ai",
    });
    return createdL2.id;
  }

  return l3Page.id;
}

/**
 * 并发安全的 findOrCreate：先尝试创建，若唯一约束冲突则回退查询已有 page。
 * 防止两条 record 同时触发分类时创建同名重复 page。
 */
async function findOrCreatePage(
  userId: string,
  fields: {
    title: string;
    level: number;
    parent_id?: string;
    created_by: "ai" | "user";
  },
): Promise<{ id: string; title: string; level: number; parent_id: string | null }> {
  try {
    return await wikiPageRepo.create({
      user_id: userId,
      ...fields,
    });
  } catch (err: any) {
    // 唯一约束冲突（23505 = unique_violation）→ 回退查询
    if (err?.code === "23505") {
      const existing = await wikiPageRepo.findAllActive(userId);
      const match = existing.find(
        p =>
          p.level === fields.level &&
          p.title === fields.title &&
          (fields.parent_id ? p.parent_id === fields.parent_id : p.parent_id === null),
      );
      if (match) return match;
    }
    throw err;
  }
}
