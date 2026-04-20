/**
 * 每日全量编译维护 — Phase 14.9
 *
 * 每日 3AM 执行的 5 阶段维护流程，替代原来的简单 compileWikiForUser 调用。
 * 每个阶段独立 try/catch，单阶段失败不影响其他阶段。
 */

import * as wikiPageRepo from "../db/repositories/wiki-page.js";
import { compileWikiForUser, type CompileResult } from "./wiki-compiler.js";
import { query } from "../db/pool.js";
import { today as tzToday, todayRange } from "../lib/tz.js";
import { generateAiDiaryRecords } from "./ai-diary-stage.js";
import { discoverLinks } from "./link-discovery-stage.js";
import { runGoalQualityCleanup, type GoalQualityResult } from "./goal-quality-stage.js";

/** 触发编译的 token 阈值 */
const COMPILE_THRESHOLD = 5000;

/** 判定 page content 臃肿的字符数阈值 */
const BLOATED_CONTENT_THRESHOLD = 50000;

/** 全量维护结果 */
export interface FullMaintenanceResult {
  stages: {
    diary_compile: boolean;
    todo_sync: boolean;
    ai_diary: boolean;
    structure_optimization: boolean;
    link_discovery: boolean;
    goal_quality: boolean;
  };
  compileResult: CompileResult | null;
  bloatedPages: string[];
  goalQualityStats: GoalQualityResult;
  errors: string[];
}

/**
 * 执行全量编译维护（5 阶段串行）。
 *
 * 1. 日记编译：扫描 token_count >= 5000 的 page → 触发编译
 * 2. Todo 状态同步：goal page 关联的 todo 完成状态变化
 * 3. AI 交互素材分发：当日有价值的 chat 对话摘要
 * 4. 跨 page 结构优化：检测臃肿 page，标记待拆分
 * 5. Link 发现：TODO 占位
 */
export async function runFullCompileMaintenance(
  userId: string,
): Promise<FullMaintenanceResult> {
  const result: FullMaintenanceResult = {
    stages: {
      diary_compile: false,
      todo_sync: false,
      ai_diary: false,
      structure_optimization: false,
      link_discovery: false,
      goal_quality: false,
    },
    compileResult: null,
    bloatedPages: [],
    goalQualityStats: { suggestedDismissed: 0, hollowDismissed: 0, duplicatesMerged: 0 },
    errors: [],
  };

  // ── 阶段 1: 日记编译 ──
  try {
    // 直接 SQL 筛选，避免拉全量 page 再 JS 过滤
    const pendingCompile = await query<{ id: string; token_count: number }>(
      `SELECT id, token_count FROM wiki_page WHERE user_id = $1 AND status = 'active' AND token_count >= $2`,
      [userId, COMPILE_THRESHOLD],
    );

    if (pendingCompile.length > 0) {
      console.log(
        `[full-maintenance] 阶段 1: ${pendingCompile.length} 个 page 待编译 (token_count >= ${COMPILE_THRESHOLD})`,
      );
      // 记录编译前各 page 的 token_count（编译期间可能有新 record 累加）
      const tokensBefore = new Map(pendingCompile.map(p => [p.id, p.token_count]));
      result.compileResult = await compileWikiForUser(userId);
      result.stages.diary_compile = true;

      // 减去编译前的 token_count（而非归零，保留编译期间新增的 token）
      for (const page of pendingCompile) {
        const before = tokensBefore.get(page.id) ?? 0;
        await wikiPageRepo.decrementTokenCount(page.id, before);
      }
      console.log(`[full-maintenance] 阶段 1 完成: 编译 ${result.compileResult.records_compiled} 条记录`);
    } else {
      console.log(`[full-maintenance] 阶段 1: 无待编译 page，跳过`);
    }
  } catch (err: any) {
    console.error(`[full-maintenance] 阶段 1 失败: ${err.message}`);
    result.errors.push(`diary_compile: ${err.message}`);
  }

  // ── 阶段 2: Todo 状态同步 ──
  try {
    // 简化实现：查找 goal page 关联的已完成 todo，标记 page 需要下次编译更新
    const goalPagesFiltered = await query<{ id: string; metadata: Record<string, any> }>(
      `SELECT id, metadata FROM wiki_page WHERE user_id = $1 AND status = 'active' AND page_type = 'goal'`,
      [userId],
    );

    if (goalPagesFiltered.length > 0) {
      const todayStr = tzToday();
      const pageIds = goalPagesFiltered.map(p => p.id);

      if (pageIds.length > 0) {
        const placeholders = pageIds.map((_, i) => `$${i + 1}`).join(", ");
        const completedTodos = await query<{ wiki_page_id: string; cnt: string }>(
          `SELECT wiki_page_id, COUNT(*)::text AS cnt FROM todo
           WHERE wiki_page_id IN (${placeholders})
             AND done = true
             AND updated_at >= (now() - interval '24 hours')
           GROUP BY wiki_page_id`,
          pageIds,
        );

        // 对有变化的 goal page 标记需要更新（通过增加少量 token_count 让下次编译覆盖）
        for (const row of completedTodos) {
          // 在 metadata 中标记 todo_sync_pending
          const page = goalPagesFiltered.find(p => p.id === row.wiki_page_id);
          if (page) {
            await wikiPageRepo.update(page.id, {
              metadata: { ...page.metadata, todo_sync_pending: true, todo_sync_date: todayStr },
            });
          }
        }
      }
    }
    result.stages.todo_sync = true;
    console.log(`[full-maintenance] 阶段 2 完成: todo 状态同步`);
  } catch (err: any) {
    console.error(`[full-maintenance] 阶段 2 失败: ${err.message}`);
    result.errors.push(`todo_sync: ${err.message}`);
  }

  // ── 阶段 3: AI 交互素材分发 ──
  try {
    const compileSummary = result.compileResult?.summary ?? undefined;
    const aiDiaryResult = await generateAiDiaryRecords(userId, {
      compileSummary,
    });
    result.stages.ai_diary = aiDiaryResult.chatRecordsCreated > 0 || aiDiaryResult.summaryRecordCreated;
    console.log(
      `[full-maintenance] 阶段 3 完成: chat record=${aiDiaryResult.chatRecordsCreated}, summary=${aiDiaryResult.summaryRecordCreated}`,
    );
  } catch (err: any) {
    console.error(`[full-maintenance] 阶段 3 失败: ${err.message}`);
    result.errors.push(`ai_diary: ${err.message}`);
  }

  // ── 阶段 4: 跨 page 结构优化 ──
  try {
    // 简化实现：检测 content 过长的臃肿 page，标记待拆分
    const allActive = await wikiPageRepo.findAllActive(userId);
    for (const page of allActive) {
      if (page.content && page.content.length > BLOATED_CONTENT_THRESHOLD) {
        result.bloatedPages.push(page.id);
        await wikiPageRepo.update(page.id, {
          metadata: { ...page.metadata, needs_split: true },
        });
        console.log(
          `[full-maintenance] 阶段 4: page ${page.id} (${page.title}) content ${page.content.length} 字符，标记待拆分`,
        );
      }
    }
    result.stages.structure_optimization = result.bloatedPages.length > 0;
    console.log(`[full-maintenance] 阶段 4 完成: ${result.bloatedPages.length} 个臃肿 page`);
  } catch (err: any) {
    console.error(`[full-maintenance] 阶段 4 失败: ${err.message}`);
    result.errors.push(`structure_optimization: ${err.message}`);
  }

  // ── 阶段 5: Link 发现 ──
  try {
    const linkResult = await discoverLinks(userId);
    result.stages.link_discovery = linkResult.linksCreated > 0;
    console.log(`[full-maintenance] 阶段 5 完成: 发现 ${linkResult.linksCreated} 个链接`);
  } catch (err: any) {
    console.error(`[full-maintenance] 阶段 5 失败: ${err.message}`);
    result.errors.push(`link_discovery: ${err.message}`);
  }

  // ── 阶段 6: 目标质量维护 ──
  try {
    const qualityResult = await runGoalQualityCleanup(userId);
    result.goalQualityStats = qualityResult;
    const totalCleaned = qualityResult.suggestedDismissed + qualityResult.hollowDismissed + qualityResult.duplicatesMerged;
    result.stages.goal_quality = totalCleaned > 0;
    console.log(
      `[full-maintenance] 阶段 6 完成: suggested=${qualityResult.suggestedDismissed}, hollow=${qualityResult.hollowDismissed}, dedup=${qualityResult.duplicatesMerged}`,
    );
  } catch (err: any) {
    console.error(`[full-maintenance] 阶段 6 失败: ${err.message}`);
    result.errors.push(`goal_quality: ${err.message}`);
  }

  return result;
}
