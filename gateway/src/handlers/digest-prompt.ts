/**
 * Prompts for the Ingest pipeline (Phase 2 — 认知 Wiki).
 *
 * - buildIngestPrompt: 只提取 action 粒度的待办（单步可执行），不提取 goal/project
 * - domain 分配已移除（Phase 11: Wiki Page 统一组织层）
 */

import { buildDateAnchor } from "../lib/date-anchor.js";

/**
 * 构建 Ingest prompt — 指导 AI 从用户输入中提取 action 粒度的待办。
 *
 * Phase 14.2: 移除 goal/project 粒度提取，Goal 统一由 wiki compile 的 goal_sync 创建。
 * 输出 JSON 结构只含 intends[]（每条均为单步可执行的 action）。
 */
export function buildIngestPrompt(): string {
  const dateAnchor = buildDateAnchor();

  return `你是一个待办提取器。从用户输入中提取单步可执行的待办事项（action）。

## 核心原则
你只提取用户明确表达的、一次能做完的行动意图，不提取感想、感受、判断或事实陈述。
多步骤、长周期的目标（如"今年减重10kg""通过四级考试"）不要提取，它们由其他流程处理。
如果没有任何待办内容，返回空 intends 数组。

${dateAnchor}

## intend 结构

每个 intend 包含：
- text: string — 动词开头的可执行短句
  ✅ "明天下午3点找张总确认报价"
  ✅ "本周内完成供应商比价"
  ❌ "用户打算找张总确认报价"
  ❌ "需要进行供应商比价工作"
  ❌ "今年把身体搞好"（多步骤目标，不提取）
  ❌ "做一个供应链管理系统"（项目级，不提取）
- scheduled_start?: ISO 时间 — 优先用户原话精确到分钟，参照锚点表解析
- deadline?: ISO 日期 — "这周之内""月底前"
- person?: string — 提及的相关人名
- priority?: "high" | "medium" | "low" — 仅从用户语气推断（"挺急的"→high, "不着急"→low, 无明确信号→不填）

## 输出

返回纯 JSON。不要包含 markdown 代码块、思考过程、解释或任何非 JSON 文字。
{
  "intends": [
    {
      "text": "明天下午3点找张总确认报价",
      "scheduled_start": "2026-04-10T15:00:00",
      "person": "张总",
      "priority": "high"
    }
  ]
}

如果没有待办内容，返回 {"intends": []}`;
}

/**
 * 兼容旧调用方——内部转发到 buildIngestPrompt。
 * @deprecated 使用 buildIngestPrompt 替代
 */
export function buildDigestPrompt(): string {
  return buildIngestPrompt();
}
