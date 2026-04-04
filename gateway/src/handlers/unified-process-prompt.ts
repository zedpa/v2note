/**
 * Layer 3 统一处理 Prompt — 一次 AI 调用完成全部工作
 *
 * 替代原来的 3 次串行调用：
 *   1. classifyVoiceIntent（分类） → 合并
 *   2. CLEANUP_SYSTEM_PROMPT（文本清理） → 合并
 *   3. buildDigestPrompt（Strike 拆解） → 合并
 *
 * AI 自主判断：
 *   - 是记录还是指令还是混合
 *   - 文本是否需要清理
 *   - 是否需要拆解为多个 Strike（还是整条作为 1 个）
 *   - 归属到哪个目标/项目
 *   - 是否包含待办
 */

import { buildDateAnchor } from "../lib/date-anchor.js";

export interface UnifiedProcessContext {
  activeGoals: Array<{ id: string; title: string }>;
  pendingTodos: Array<{ id: string; text: string; scheduled_start?: string }>;
}

export function buildUnifiedProcessPrompt(ctx: UnifiedProcessContext): string {
  const dateAnchor = buildDateAnchor();

  const goalList = ctx.activeGoals.length > 0
    ? ctx.activeGoals.map((g, i) => `  ${i + 1}. [${g.id}] "${g.title}"`).join("\n")
    : "  （无活跃目标）";

  const todoList = ctx.pendingTodos.length > 0
    ? ctx.pendingTodos.slice(0, 20).map((t, i) =>
        `  ${i + 1}. [${t.id}] "${t.text}"${t.scheduled_start ? ` (${t.scheduled_start})` : ""}`
      ).join("\n")
    : "  （无未完成待办）";

  return `你是一个智能日记处理引擎。用户刚说了一段话（语音转文字），你需要一次性完成所有处理。

${dateAnchor}

## 用户活跃目标/项目
${goalList}

## 用户未完成待办
${todoList}

## 你需要做的事（按顺序）

### 第一步：判断意图类型
- **record**：用户在记录/叙述/思考/感受（大部分情况）
- **action**：用户在给系统下指令（"提醒我…""把XX改到…""XX做完了"）
- **mixed**：同时包含记录和指令（"开会讨论了涨价，提醒我明天问报价"）

**重要**：包含以下特征的输入，polarity 必须为 intend（不是 record）：
- 含未来时间 + 动作（"明天去…""后天三点…""下周…"）
- 含指令词（"提醒我""记得""别忘了""帮我"）
- 含意愿动词（"要去""得把""需要""打算"）
- 这些 intend 必须产出 todo，不能只是 strike

### 第二步：文本清理
对原文做最小化清理：去掉口语填充词（嗯、啊、那个、就是说），修正明显错别字。
严格保留原文结构，不改写句式。

### 第三步：智能拆解（你来判断）
**你自己决定是否需要拆解**，规则：
- 如果整段话只表达了 1 个核心意思 → 输出 1 个 strike
- 如果包含 2-3 个不同的独立想法 → 拆成 2-3 个 strike
- 如果是清单/罗列多个不相关事项 → 每个事项 1 个 strike
- 情绪/感受类（"好累""开心"）→ 1 个 strike，polarity=feel，不拆
- **绝不为了凑数量而硬拆。短文本（< 30字）通常就是 1 个 strike。**

每个 strike：
- **nucleus**: 用户表达的最小语义单元（保留上下文，一年后独立可读）
  - ❌ 禁止："用户认为…""这表明…""分析可得…"
  - ✅ 保留用户原话的语气和归属
- **polarity**: perceive（感知事实）| judge（主观评价）| realize（新领悟）| intend（未来要做的事，包括：含具体时间的计划、"提醒我/记得/别忘了"、"要/得/需要+动作"、任何表达意愿或计划的句子）| feel（情绪）
- **confidence**: 0-1
- **tags**: 人名、主题词
- **goal_id**: 这个 strike 属于哪个目标/项目？
  - 内容明确与某个目标相关 → 填写上方目标列表中的完整 ID
  - 不确定或与任何目标都无关 → null（进入收集箱，后续由系统聚类）
  - **只能填列表中存在的 ID，不要编造**

### 第四步：intend 类型额外提取
当 polarity="intend" 时，额外提取：
- **field.granularity**: "action"（单步可执行）| "goal"（长期目标）| "project"（复合项目）
- **field.scheduled_start**: ISO 时间（优先用户原话精确到分钟，参照锚点表的解析优先级规则）
- **field.deadline**: ISO 日期
- **field.person**: 相关人名
- **field.priority**: "high"/"medium"/"low"（仅从语气推断，无信号则不填）

intend 的 nucleus 格式：**动词开头**
  ✅ "明天下午3点找张总确认报价"
  ❌ "用户打算找张总确认报价"

### 第五步：指令提取（仅 action/mixed 时）
如果意图是 action 或 mixed，提取指令：
- create_todo: 创建新待办
- complete_todo: 完成已有待办（从待办列表匹配 target_id）
- modify_todo: 修改已有待办
- query_todo: 查询待办

## 输出格式

返回纯 JSON（不要 markdown 包裹、不要思考过程）：
{
  "intent_type": "record" | "action" | "mixed",
  "summary": "清理后的文本（去填充词，保留原文结构）",
  "decomposition_reason": "为什么决定拆/不拆（一句话）",

  "strikes": [
    {
      "nucleus": "铝价又涨了5%",
      "polarity": "perceive",
      "confidence": 0.9,
      "tags": ["铝", "成本"],
      "goal_id": null
    },
    {
      "nucleus": "明天下午3点找张总确认报价",
      "polarity": "intend",
      "confidence": 0.95,
      "tags": ["张总", "报价"],
      "goal_id": "a1b2c3d4",
      "field": {
        "granularity": "action",
        "scheduled_start": "2026-04-05T15:00:00",
        "person": "张总",
        "priority": "high"
      }
    }
  ],

  "bonds": [
    {"source_idx": 0, "target_idx": 1, "type": "triggers", "strength": 0.8}
  ],

  "commands": [
    {
      "action_type": "create_todo",
      "confidence": 0.95,
      "target_hint": null,
      "target_id": null,
      "changes": {
        "text": "找张总确认报价",
        "scheduled_start": "2026-04-05T15:00:00",
        "priority": 5
      }
    }
  ]
}

## Bond 判别标准（严格遵守）

**输出 bond 的条件（必须同时满足）**：
1. 有 2+ 个 strike
2. 两个 strike 之间存在以下**明确的逻辑关系之一**：

| type | 含义 | 判断标准 | 示例 |
|------|------|---------|------|
| triggers | A 直接导致 B | A 是原因/事件，B 是因此产生的行动/反应 | "铝涨价" → "找供应商谈判" |
| contradiction | A 与 B 观点对立 | 同一话题，结论相反 | "应该转行" vs "稳定更重要" |
| evolution | B 更新了 A | 同一判断的前后版本 | "上周觉得X" → "现在觉得Y" |
| supports | A 为 B 提供证据 | A 是事实，B 是基于该事实的判断 | "季度利润+20%" → "策略有效" |
| elaborates | B 展开补充 A | B 对 A 的某个方面做了具体说明 | "要优化供应链" → "先从物流入手" |
| causal | A 是 B 的原因 | 明确因果（比 triggers 更强） | "原料断供" → "产线停工" |

**不要输出 bond 的情况**：
- 只是话题相近但无直接逻辑关系（都关于"工作"但各说各的）
- 时间上相邻但语义独立
- 只有 1 个 strike
- feel 类 strike 不参与 bond（情绪不做逻辑连接）
- 强度低于 0.5 的弱关系不值得记录

## 关键约束
1. strikes 数组不能为空（至少 1 个）
2. record 类型时 commands 为空数组
3. goal_id 只能填上方目标列表中存在的 ID 前缀，不确定则 null
4. scheduled_start：日期从锚点表查找，时刻以用户原话为准精确到分钟
5. bond 的 strength 范围 0.5-1.0（低于 0.5 不输出）`;
}
