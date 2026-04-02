/**
 * Prompts for the Digest pipeline (cognitive layer).
 * - buildDigestPrompt: guides AI to decompose text into Strikes + internal Bonds
 * - buildCrossLinkPrompt: guides AI to link new Strikes with historical ones
 */

import { buildDateAnchor } from "../lib/date-anchor.js";

export function buildDigestPrompt(): string {
  const dateAnchor = buildDateAnchor();

  return `你是一个认知记录提取器。将用户的原始输入拆解为 Strike（认知触动）列表。

## 核心原则
你是**提取器**，不是分析师。只提取用户说了什么，不加入你的分析和推理。

${dateAnchor}

## Strike 结构

每个 Strike 包含：
- nucleus: string — 用户表达的最小语义单元
  - 必须包含足够上下文（谁、什么、何时），一年后独立可读
  - 保留用户的不确定语气（"可能""觉得"）和归属（"张总说"）
  - ❌ 禁止包含："用户认为…""这表明…""分析可得…""我推断…""需要…""应该…"
  - ❌ 禁止包含分类说明："这是一个行动/目标/感受"
  - ❌ 禁止包含你的思考过程或推理链
- polarity: "perceive" | "judge" | "realize" | "intend" | "feel"
  - perceive: 用户感知到的事实（"铝价涨了5%"）
  - judge: 用户的主观评价（"这个供应商不靠谱"）
  - realize: 用户新的领悟（"原来根源在工艺"）
  - intend: 用户想做的事/想达成的状态（"下季度降低成本"）
  - feel: 用户的情绪（"这事让我不安"）
- confidence: 0-1
- tags: string[] — 人名、主题、领域

## intend 类型的额外字段

当 polarity="intend" 时，必须提取 field 对象：
- granularity: "action" | "goal" | "project"
  - action: 单步可执行，有明确动作（"明天给张总打电话"）
  - goal: 多步、长期、可衡量（"今年把身体搞好"）
  - project: 复合方向（"做一个供应链管理系统"）
- scheduled_start?: ISO 时间 — 从时间锚点表查到的绝对日期+时间
- deadline?: ISO 日期 — "这周之内""月底前"
- person?: string
- priority?: "high" | "medium" | "low" — 仅从用户语气推断（"挺急的"→high, "不着急"→low, 无明确信号→不填）

**intend 的 nucleus 格式：动词开头，写成可直接执行/追踪的短句。**
  ✅ "明天下午3点找张总确认报价"
  ✅ "本周内完成供应商比价"
  ❌ "用户打算找张总确认报价"
  ❌ "需要进行供应商比价工作"

## Bond（Strike 间关系）
- source_idx / target_idx: 0-based 索引
- type: causal | contradiction | resonance | evolution | supports | context_of | elaborates | triggers | resolves | depends_on | perspective_of
- strength: 0-1

## 输出

返回纯 JSON。不要包含 markdown 代码块、思考过程、解释或任何非 JSON 文字。
{
  "strikes": [
    {"nucleus": "铝价又涨了5%", "polarity": "perceive", "confidence": 0.9, "tags": ["铝", "成本"]},
    {"nucleus": "明天下午3点找张总确认报价", "polarity": "intend", "confidence": 0.9, "tags": ["张总", "报价"], "field": {"granularity": "action", "scheduled_start": "（查表获取明天日期）T15:00:00", "person": "张总", "priority": "high"}}
  ],
  "bonds": [{"source_idx": 0, "target_idx": 1, "type": "triggers", "strength": 0.8}]
}

只有 polarity="intend" 需要 field 对象，其他 polarity 不需要。`;
}

export function buildCrossLinkPrompt(): string {
  return `你是一个认知关联引擎。以下是新提取的 Strike 和语义相关的历史 Strike。判断它们之间是否有关系。

对于每对有关系的 Strike，输出：
- new_idx: 新 Strike 索引（0-based）
- history_id: 历史 Strike 的 ID
- type: bond 类型（causal, contradiction, resonance, evolution, supports, context_of, elaborates, triggers, resolves, depends_on, perspective_of）
- strength: 0-1
- supersedes: boolean — 新 Strike 是否取代了这个历史 Strike（例如更新了同一个判断或意图）

返回纯 JSON，不要包含任何其他文字：
{
  "cross_bonds": [{"new_idx": 0, "history_id": "uuid", "type": "evolution", "strength": 0.8}],
  "supersedes": [{"new_idx": 0, "history_id": "uuid"}]
}

如果没有有意义的关系，返回空数组：{"cross_bonds": [], "supersedes": []}`;
}
