/**
 * goal-page-factory — goal page + goal todo 事务内创建的共享函数
 *
 * 提取自 manage-wiki-page.ts 和 wiki.ts 的重复逻辑。
 * 在事务中同时创建 goal 类型的 wiki_page 和对应的 todo（level=1）。
 */
import * as wikiPageRepo from "./wiki-page.js";
import type { WikiPage } from "./wiki-page.js";
import * as todoRepo from "./todo.js";
import type { Queryable } from "../pool.js";

/**
 * 在事务内创建 goal page 和对应的 goal todo
 *
 * @param userId - 用户 ID
 * @param title - 目标标题
 * @param parentId - 父 page ID（null 表示顶层）
 * @param client - 事务客户端（必传，因为此函数总是在事务中使用）
 * @returns 创建的 WikiPage
 */
export async function createGoalPageWithTodo(
  userId: string,
  title: string,
  parentId: string | null,
  client: NonNullable<Queryable>,
): Promise<WikiPage> {
  const page = await wikiPageRepo.create({
    user_id: userId,
    title,
    parent_id: parentId ?? undefined,
    level: parentId ? 2 : 3,
    page_type: "goal",
    created_by: "user",
  }, client);

  await todoRepo.create({
    device_id: userId,
    user_id: userId,
    text: title,
    status: "active",
    level: 1,
    done: false,
    category: "manual",
    wiki_page_id: page.id,
  }, client);

  return page;
}
