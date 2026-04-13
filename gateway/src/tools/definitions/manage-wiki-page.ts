/**
 * manage_wiki_page — 统一的 Wiki Page 管理工具
 *
 * 替代旧的 manage_folder / move_record / list_folders 三个工具。
 * 以 wiki_page 为唯一组织结构，操作 wiki_page_record 关联表。
 */

import { z } from "zod";
import * as wikiPageRepo from "../../db/repositories/wiki-page.js";
import * as wikiPageRecordRepo from "../../db/repositories/wiki-page-record.js";
import { query, execute, getPool } from "../../db/pool.js";
import { createGoalPageWithTodo } from "../../db/repositories/goal-page-factory.js";
import type { ToolDefinition } from "../types.js";

/** 检查同 parent 下是否有同名 active page（excludeId 排除自身，用于 rename） */
async function hasDuplicateTitle(
  userId: string,
  title: string,
  parentId: string | null,
  excludeId?: string,
): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM wiki_page
     WHERE user_id = $1 AND title = $2
       AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000') = COALESCE($3, '00000000-0000-0000-0000-000000000000')
       AND status = 'active'
       ${excludeId ? "AND id != $4" : ""}
     LIMIT 1`,
    excludeId ? [userId, title, parentId ?? null, excludeId] : [userId, title, parentId ?? null],
  );
  return rows.length > 0;
}

export const manageWikiPageTool: ToolDefinition = {
  name: "manage_wiki_page",
  description: `管理用户的知识主题（wiki page）。
使用：用户要创建、重命名、删除、合并主题（"新建一个旅行主题"、"把工作事务重命名为工作"、"删掉杂项主题"）。
使用：要移动单条记录到某个主题 → action="move_record"。
使用：要查看所有主题列表 → action="list"。
不用：要搜索某个主题下的记录 → 用 search。
不用：要查看主题详情/内容 → 用 view。`,
  parameters: z.object({
    action: z.enum(["create", "rename", "delete", "merge", "move_record", "list"]).describe("操作类型"),
    // create
    title: z.string().optional().describe("主题标题（create 时必填）"),
    page_type: z.enum(["topic", "goal"]).optional().describe("页面类型，默认 topic"),
    parent_id: z.string().optional().describe("父主题 ID（create 时可选，有值则创建子主题）"),
    // rename / delete
    page_id: z.string().optional().describe("目标主题 ID（rename/delete 时必填）"),
    new_title: z.string().optional().describe("新标题（rename 时必填）"),
    // merge
    source_id: z.string().optional().describe("源主题 ID（merge 时必填）"),
    target_id: z.string().optional().describe("目标主题 ID（merge 时必填）"),
    // move_record
    record_id: z.string().optional().describe("记录 ID（move_record 时必填）"),
  }),
  autonomy: "confirm",
  handler: async (args, ctx) => {
    if (!ctx.userId) {
      return { success: false, message: "需要用户身份" };
    }

    switch (args.action) {
      // ── create ──
      case "create": {
        if (!args.title || args.title.trim().length === 0) {
          return { success: false, message: "创建主题需要提供非空标题" };
        }
        const trimmedTitle = args.title.trim();
        const parentId = args.parent_id ?? null;

        // 重复标题检查
        if (await hasDuplicateTitle(ctx.userId, trimmedTitle, parentId)) {
          return { success: false, message: `标题「${trimmedTitle}」已存在` };
        }

        const pageType = args.page_type ?? "topic";

        if (pageType === "goal") {
          // goal page + goal todo 在同一事务中创建
          const client = await getPool().connect();
          try {
            await client.query("BEGIN");
            const page = await createGoalPageWithTodo(ctx.userId, trimmedTitle, parentId, client);
            await client.query("COMMIT");
            return {
              success: true,
              message: `已创建目标主题「${trimmedTitle}」`,
              data: { page: { id: page.id, title: page.title, level: page.level, parentId: parentId } },
            };
          } catch (txErr) {
            await client.query("ROLLBACK");
            throw txErr;
          } finally {
            client.release();
          }
        } else {
          const page = await wikiPageRepo.create({
            user_id: ctx.userId,
            title: trimmedTitle,
            parent_id: parentId ?? undefined,
            level: parentId ? 2 : 3,
            page_type: pageType,
            created_by: "user",
          });
          return {
            success: true,
            message: `已创建主题「${trimmedTitle}」`,
            data: { page: { id: page.id, title: page.title, level: page.level, parentId: parentId } },
          };
        }
      }

      // ── rename ──
      case "rename": {
        if (!args.page_id) {
          return { success: false, message: "重命名需要提供 page_id" };
        }
        if (!args.new_title || args.new_title.trim().length === 0) {
          return { success: false, message: "重命名需要提供非空 new_title" };
        }
        const page = await wikiPageRepo.findById(args.page_id);
        if (!page || page.user_id !== ctx.userId) {
          return { success: false, message: "主题不存在或无权访问" };
        }
        const newTitle = args.new_title.trim();
        if (await hasDuplicateTitle(ctx.userId, newTitle, page.parent_id, args.page_id)) {
          return { success: false, message: `标题「${newTitle}」已存在` };
        }
        const oldTitle = page.title;
        await wikiPageRepo.update(args.page_id, { title: newTitle });
        return {
          success: true,
          message: `已将「${oldTitle}」重命名为「${newTitle}」`,
          data: { old_title: oldTitle, new_title: newTitle },
        };
      }

      // ── delete ──
      case "delete": {
        if (!args.page_id) {
          return { success: false, message: "删除需要提供 page_id" };
        }
        const page = await wikiPageRepo.findById(args.page_id);
        if (!page || page.user_id !== ctx.userId) {
          return { success: false, message: "主题不存在或无权访问" };
        }

        // 1. 解除所有 record 关联
        const unlinkedIds = await wikiPageRecordRepo.unlinkAllByPage(args.page_id);

        // 2. 清除被解除关联的 record 的 compile_status
        if (unlinkedIds.length > 0) {
          await execute(
            `UPDATE record SET compile_status = NULL WHERE id = ANY($1::uuid[])`,
            [unlinkedIds],
          );
        }

        // 3. 子页面提升为顶层
        const children = await wikiPageRepo.findByParent(args.page_id);
        if (children.length > 0) {
          await execute(
            `UPDATE wiki_page SET parent_id = NULL, level = 3 WHERE parent_id = $1`,
            [args.page_id],
          );
        }

        // 4. goal page 清 todo.wiki_page_id
        if (page.page_type === "goal") {
          await execute(
            `UPDATE todo SET wiki_page_id = NULL WHERE wiki_page_id = $1`,
            [args.page_id],
          );
        }

        // 5. 归档
        await wikiPageRepo.updateStatus(args.page_id, "archived");

        return {
          success: true,
          message: `已删除主题「${page.title}」，${unlinkedIds.length} 条记录变为未归类`,
          data: { unlinked_records: unlinkedIds.length },
        };
      }

      // ── merge ──
      case "merge": {
        if (!args.source_id || !args.target_id) {
          return { success: false, message: "合并需要提供 source_id 和 target_id" };
        }
        if (args.source_id === args.target_id) {
          return { success: false, message: "不能将主题合并到自身" };
        }
        const source = await wikiPageRepo.findById(args.source_id);
        if (!source || source.user_id !== ctx.userId) {
          return { success: false, message: "源主题不存在或无权访问" };
        }
        const target = await wikiPageRepo.findById(args.target_id);
        if (!target || target.user_id !== ctx.userId) {
          return { success: false, message: "目标主题不存在或无权访问" };
        }
        if (target.status !== "active") {
          return { success: false, message: "目标主题必须是 active 状态" };
        }

        // 1. 转移 record 关联
        const transferred = await wikiPageRecordRepo.transferAll(args.source_id, args.target_id);

        // 2. 如果 source 是 goal page，转移 todo.wiki_page_id
        if (source.page_type === "goal") {
          const goalTodos = await query<{ id: string }>(
            `SELECT id FROM todo WHERE wiki_page_id = $1`,
            [args.source_id],
          );
          if (goalTodos.length > 0) {
            await execute(
              `UPDATE todo SET wiki_page_id = $1 WHERE wiki_page_id = $2`,
              [args.target_id, args.source_id],
            );
          }
        }

        // 3. 归档 source
        await wikiPageRepo.updateStatus(args.source_id, "merged", args.target_id);

        return {
          success: true,
          message: `已将「${source.title}」合并到「${target.title}」`,
          data: { transferred_records: transferred },
        };
      }

      // ── move_record ──
      case "move_record": {
        if (!args.record_id) {
          return { success: false, message: "移动记录需要提供 record_id" };
        }

        // 验证 record 存在且属于用户
        const records = await query<{ id: string; user_id: string }>(
          `SELECT id, user_id FROM record WHERE id = $1`,
          [args.record_id],
        );
        if (records.length === 0 || records[0].user_id !== ctx.userId) {
          return { success: false, message: "记录不存在或无权访问" };
        }

        // 先验证目标 page（避免 unlink 后发现 target 无效导致数据丢失）
        let targetPage: Awaited<ReturnType<typeof wikiPageRepo.findById>> = null;
        if (args.page_id !== null && args.page_id !== undefined) {
          targetPage = await wikiPageRepo.findById(args.page_id);
          if (!targetPage || targetPage.user_id !== ctx.userId) {
            return { success: false, message: "Page not found" };
          }
        }

        // 获取旧关联
        const oldLinks = await wikiPageRecordRepo.findPagesByRecord(args.record_id);

        // 清除所有旧关联
        await wikiPageRecordRepo.unlinkAllByRecord(args.record_id);

        // 建立新关联
        if (targetPage) {
          await wikiPageRecordRepo.link(args.page_id!, args.record_id);
          return {
            success: true,
            message: `已将记录移动到「${targetPage!.title}」`,
            data: {
              old_pages: oldLinks.map(l => l.wiki_page_id),
              new_page: targetPage!.title,
            },
          };
        } else {
          return {
            success: true,
            message: "已将记录移到未归类",
            data: {
              old_pages: oldLinks.map(l => l.wiki_page_id),
              new_page: null,
            },
          };
        }
      }

      // ── list ──
      case "list": {
        const pages = await wikiPageRepo.findAllActive(ctx.userId!);

        // 查询 record counts
        const recordCounts = await query<{ wiki_page_id: string; cnt: string }>(
          `SELECT wiki_page_id, COUNT(*)::text AS cnt FROM wiki_page_record wpr
           JOIN wiki_page wp ON wp.id = wpr.wiki_page_id
           WHERE wp.user_id = $1 AND wp.status = 'active'
           GROUP BY wiki_page_id`,
          [ctx.userId],
        );
        const countMap = new Map(recordCounts.map(r => [r.wiki_page_id, parseInt(r.cnt, 10)]));

        // 查询 child counts
        const childCounts = await query<{ parent_id: string; cnt: string }>(
          `SELECT parent_id, COUNT(*)::text AS cnt FROM wiki_page
           WHERE user_id = $1 AND status = 'active' AND parent_id IS NOT NULL
           GROUP BY parent_id`,
          [ctx.userId],
        );
        const childMap = new Map(childCounts.map(r => [r.parent_id, parseInt(r.cnt, 10)]));

        // 查询 inbox count
        const inboxRows = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM record r
           WHERE r.user_id = $1 AND r.status = 'completed' AND r.archived = false
             AND NOT EXISTS (
               SELECT 1 FROM wiki_page_record wpr WHERE wpr.record_id = r.id
             )`,
          [ctx.userId],
        );
        const inboxCount = parseInt(inboxRows[0]?.count ?? "0", 10);

        const tree = pages.map(p => ({
          title: p.title,
          level: p.level,
          recordCount: countMap.get(p.id) ?? 0,
          childCount: childMap.get(p.id) ?? 0,
        }));

        return {
          success: true,
          message: `共 ${pages.length} 个主题，${inboxCount} 条未归类`,
          data: {
            pages: tree,
            inbox_count: inboxCount,
          },
        };
      }

      default:
        return { success: false, message: `未知操作: ${args.action}` };
    }
  },
};
