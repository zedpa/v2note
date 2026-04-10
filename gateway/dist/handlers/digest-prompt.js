/**
 * Prompts for the Ingest pipeline (Phase 2 — 认知 Wiki).
 *
 * - buildIngestPrompt: 只提取 intend 类型的待办/目标，不拆解 Strike/Bond
 * - domain 分配已移除（Phase 11: Wiki Page 统一组织层）
 */
import { buildDateAnchor } from "../lib/date-anchor.js";
/**
 * 构建 Ingest prompt — 指导 AI 从用户输入中提取 intend（待办/目标）。
 *
 * 不再生成 Strike/Bond 列表，不再分配 domain。
 * 输出 JSON 结构只含 intends[]。
 */
export function buildIngestPrompt() {
    const dateAnchor = buildDateAnchor();
    return `你是一个待办/目标提取器。从用户输入中提取 intend 类型的内容（可执行的待办、目标、项目）。

## 核心原则
你只提取用户明确表达的行动意图，不提取感想、感受、判断或事实陈述。
如果没有任何待办/目标内容，返回空 intends 数组。

${dateAnchor}

## intend 结构

每个 intend 包含：
- text: string — 动词开头的可执行短句
  ✅ "明天下午3点找张总确认报价"
  ✅ "本周内完成供应商比价"
  ❌ "用户打算找张总确认报价"
  ❌ "需要进行供应商比价工作"
- granularity: "action" | "goal" | "project"
  - action: 单步可执行，有明确动作（"明天给张总打电话"）
  - goal: 多步、长期、可衡量（"今年把身体搞好"）
  - project: 复合方向（"做一个供应链管理系统"）
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
      "granularity": "action",
      "scheduled_start": "2026-04-10T15:00:00",
      "person": "张总",
      "priority": "high"
    }
  ]
}

如果没有待办/目标内容，返回 {"intends": []}`;
}
/**
 * 兼容旧调用方——内部转发到 buildIngestPrompt。
 * @deprecated 使用 buildIngestPrompt 替代
 */
export function buildDigestPrompt() {
    return buildIngestPrompt();
}
//# sourceMappingURL=digest-prompt.js.map