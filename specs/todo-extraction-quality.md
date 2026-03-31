# 待办提取质量修复

> 状态：✅ 已完成

## 概述
修复待办提取链路的系统性质量问题：模型能力不足（qwen-plus 指令遵循差）、提示词缺乏约束、AI 思考过程污染输出、指令/记录不分流、对话 AI 回复被二次提取。通过模型升级 + 提示词重写 + 代码防御三管齐下解决。

## 现状问题

| # | 问题 | 根因 | 位置 |
|---|------|------|------|
| 1 | **模型能力不足** — qwen-plus 对复杂 JSON 结构化提取和指令遵循能力弱 | fast tier 使用 qwen-plus（非推理模型），提取质量差 | provider.ts tier 配置 |
| 2 | **AI `<think>` 思考内容混入 JSON** | digest/process/voice-action 用裸 `JSON.parse`，未调用已有 `cleanJsonResponse()` | 3 处 handler |
| 3 | **digest 提示词缺乏 nucleus 质量约束** | 无"忠实原话""禁止元语言"规则，AI 自由发挥写推理过程 | digest-prompt.ts |
| 4 | **voice-action 提示词缺乏 text 提取要求** | CLASSIFY_PROMPT 未要求 create_todo 返回清洗后的 changes.text | voice-action.ts |
| 5 | **voice-action 创建待办用整句原文** | `changes.text` 为空时 fallback 到 `original_text`（含指令前缀） | voice-action.ts:370 |
| 6 | **chat 对话 AI 回复被二次提取为待办** | `saveConversationAsRecord` 含 assistant 消息 → digest 提取 AI 建议为 intend | chat.ts:372 |

## 场景

### 场景 0: 模型层级升级 — 提取链路统一使用 qwen3.5-plus（关闭思考）

**背景**：当前 fast tier 使用 qwen-plus，这是一个纯指令模型，对复杂 JSON 结构化提取（Strike 分解、意图分类、字段提取）的能力显著弱于 qwen3.5-plus。qwen3.5-plus 关闭思考模式后延迟可控（<3s），但指令遵循和 JSON 质量远超 qwen-plus。

```
假设 (Given)  provider.ts 当前 fast tier 配置为 qwen-plus, reasoning: false
当   (When)   修改 fast tier 模型为 qwen3.5-plus，保持 reasoning: false
那么 (Then)   digest / process / voice-action 所有 tier:"fast" 调用自动升级
并且 (And)    qwen3.5-plus + enable_thinking:false → 无思考 token 开销，延迟可控
并且 (And)    JSON 结构遵循度、nucleus 质量、意图分类准确率显著提升
```

**修改点** — `gateway/src/ai/provider.ts`：
```typescript
// 当前
fast: { model: fast, reasoning: false, timeout: _defaultTimeout }

// 改为：环境变量 AI_MODEL_FAST 默认值从 qwen-plus 改为 qwen3.5-plus
const fast = process.env.AI_MODEL_FAST ?? "qwen3.5-plus";
```

**影响范围**（所有 `tier: "fast"` 调用自动受益）：
| 调用点 | 文件 | 用途 |
|--------|------|------|
| digest AI 分解 | `digest.ts:142` | Strike 提取质量 |
| 文本清理 | `process.ts:168` | summary 清理 |
| 意图分类 | `voice-action.ts:132` | 指令/记录分流 |
| 时间估算 | `time-estimator.ts:38,110` | 待办时间/优先级 |
| 批量分析 | `batch-analyze.ts:123` | cluster 聚类 |
| 子目标生成 | `todo-projector.ts:272` | 项目拆解 |

**延迟预期**：qwen3.5-plus reasoning:false 单次调用 1-3s（vs qwen-plus 0.5-2s），可接受。

### 场景 1: AI 思考标签清理
```
假设 (Given)  qwen3.5-plus 偶尔返回包含 <think>...</think> 或 ```json ``` 的响应
当   (When)   digest / process / voice-action 解析 AI 响应
那么 (Then)   自动剥离 <think> 标签和 markdown 代码块后再解析 JSON
并且 (And)    使用已有的 safeParseJson 替代裸 JSON.parse
```

**修改点：**
- `gateway/src/handlers/digest.ts:149` — `JSON.parse(digestResp.content)` → `safeParseJson(digestResp.content)`
- `gateway/src/handlers/process.ts:183` — 同上
- `gateway/src/handlers/voice-action.ts:139` — 同上
- 解析失败时保持现有降级逻辑不变

### 场景 2: digest 提示词重写 — 提升 Strike 提取质量

```
假设 (Given)  用户说"今天开会讨论了涨价，提醒我明天问张总报价"
当   (When)   digest AI 提取 Strike
那么 (Then)   nucleus 为"明天问张总确认报价"（用户原话提炼，动词开头）
并且 (And)    不包含"根据用户描述，可以推断…"等 AI 元语言
并且 (And)    不包含"这是一个行动意图"等分类说明文字
并且 (And)    intend Strike 的 field 字段完整（granularity, scheduled_start, person）
```

**修改点** — `gateway/src/handlers/digest-prompt.ts` 完整重写 `buildDigestPrompt()`：

```
你是一个认知记录提取器。将用户的原始输入拆解为 Strike（认知触动）列表。

## 核心原则
- 你是**提取器**，不是分析师。只提取用户说了什么，不加入你的分析和推理。
- nucleus 必须忠实于用户原话，是用户语义的精炼还原，不是你的解读或改写。

当前日期：${today}（周${weekday}）。相对时间以此为基准。

## Strike 结构

每个 Strike 包含：
- nucleus: string — 用户表达的最小语义单元
  - 必须包含足够上下文（谁、什么、何时），一年后独立可读
  - 保留用户的不确定语气（"可能""觉得"）和归属（"张总说"）
  - ❌ 禁止："用户认为…""这表明…""分析可得…""我推断…"
  - ❌ 禁止：分类说明（"这是一个行动/目标/感受"）
  - ❌ 禁止：包含你的思考过程或推理链
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
- scheduled_start?: ISO 时间 — 明确的执行时间
- deadline?: ISO 日期 — "这周之内""月底前"
- person?: string
- priority?: "high" | "medium" | "low" — 仅从用户语气推断（"挺急的"→high）

**intend 的 nucleus 格式要求：动词开头，写成可直接执行/追踪的短句。**
  ✅ "明天下午3点找张总确认报价"
  ✅ "本周内完成供应商比价"
  ❌ "用户打算找张总确认报价"
  ❌ "需要进行供应商比价工作"

## 时间解析
- "3月25号下午3点" → "2026-03-25T15:00:00"
- "明天""后天""下周一" → 计算绝对日期
- "这周之内""月底前" → deadline
- 无时间信号 → 不填

## Bond（Strike 间关系）
- source_idx / target_idx: 0-based 索引
- type: causal | contradiction | resonance | evolution | supports | context_of | elaborates | triggers | resolves | depends_on | perspective_of
- strength: 0-1

## 输出格式

返回纯 JSON，**不要**包含 markdown 代码块、思考过程或任何非 JSON 文字：
{
  "strikes": [
    {"nucleus": "铝价又涨了5%", "polarity": "perceive", "confidence": 0.9, "tags": ["铝", "成本"]},
    {"nucleus": "明天下午3点找张总确认报价", "polarity": "intend", "confidence": 0.9, "tags": ["张总", "报价"], "field": {"granularity": "action", "scheduled_start": "${today.replace(/\d{2}$/, '26')}T15:00:00", "person": "张总", "priority": "high"}}
  ],
  "bonds": [{"source_idx": 0, "target_idx": 1, "type": "triggers", "strength": 0.8}]
}
```

**关键改进点：**
1. 角色定位从"认知分析引擎"改为"认知记录提取器"，强调提取不是分析
2. 增加 nucleus 的明确禁止规则（❌ 示例）
3. intend nucleus 要求动词开头 + 正反示例
4. 输出格式再次强调不要 markdown/思考过程

### 场景 3: voice-action 提示词重写 — 提升意图分类与文本提取

```
假设 (Given)  用户说"帮我记一下明天去开会"
当   (When)   voice-action AI 分类为 create_todo
那么 (Then)   changes.text = "明天去开会"（纯净待办内容，动词开头）
并且 (And)    不是整句"帮我记一下明天去开会"
```

**修改点 A** — `voice-action.ts` CLASSIFY_PROMPT 重写：

```
你是一个语音意图路由器。判断用户这句话是"记录"还是"指令"还是"混合"。

## 分类标准

**指令型**（用户在给系统下命令）：
- 创建待办："提醒我…" "帮我记一下要…" "别忘了…" "加个待办…"
- 完成待办："XX做完了" "XX搞定了" "XX已经打了卡"
- 修改待办："把XX改到…" "给XX推迟" "把XX提前"
- 删除待办："取消XX" "XX不用做了"
- 查询："我明天有什么安排" "还有什么没做" "XX进展怎么样"

**记录型**（用户在记录/倾述/思考）：
- 叙述、感想、反思、观察、抱怨
- 没有对系统的操作请求

**混合型**（同时包含记录和指令）：
- "开会说了涨价，提醒我明天问张总报价"

## 输出规则

返回纯 JSON（不要 markdown 包裹、不要思考过程）：
{
  "type": "record" | "action" | "mixed",
  "record_text": "记录部分文本（mixed 时必填，action 时为空字符串）",
  "actions": [
    {
      "type": "modify_todo|complete_todo|query_todo|delete_todo|create_todo|modify_goal|query_record|query_goal|general_command",
      "confidence": 0.0-1.0,
      "target_hint": "匹配关键词（人名/事项关键词）",
      "changes": {
        "text": "【create_todo 必填】纯净的待办内容，动词开头，去掉指令前缀（帮我/提醒我/记一下/别忘了）",
        "scheduled_start": "ISO 时间（如能从原文推断）",
        "priority": 1-5
      },
      "query_params": {},
      "risk_level": "low|high",
      "original_text": "指令部分原文"
    }
  ]
}

## 关键约束
- create_todo 时 changes.text **必填**，内容是提炼后的待办（动词开头），不是指令原文
  ✅ 用户说"帮我记一下明天去开会" → changes.text = "明天去开会"
  ✅ 用户说"提醒我下周找张总" → changes.text = "下周找张总"
  ❌ changes.text = "帮我记一下明天去开会"（不要保留指令前缀）
- delete_todo 和批量修改的 risk_level 为 "high"
- record 类型时 actions 为空数组
- confidence 反映你对判断的确信度
```

**修改点 B** — `voice-action.ts:370` fallback 清洗：
```typescript
/** 清洗指令前缀，提取纯净待办文本 */
function cleanActionPrefix(text: string): string {
  return text
    .replace(/^(?:帮我|请帮我|请|麻烦)?(?:记一下|记住|记得|备忘|提醒我|别忘了|加个待办|创建待办|建个待办|添加)[\s，,：:]*/, "")
    .trim() || text; // 清洗后为空则 fallback 原文
}

// executeCreateTodo 中：
const text = action.changes?.text ?? cleanActionPrefix(action.original_text);
```

### 场景 4: chat 对话存档只保留用户内容
```
假设 (Given)  用户与 AI 进行了多轮对话（history.length >= 4）
当   (When)   endChat() 保存对话为 record 进入 digest 管道
那么 (Then)   只保存用户消息（role=user），排除 AI 回复
并且 (And)    digest 不会从 AI 建议中提取出虚假的 intend Strike
```

**修改点** — `gateway/src/handlers/chat.ts:371-373`：
```typescript
// 当前：完整对话含 assistant → AI 建议被 digest 提取为用户意图
const messages = history.map(m => ({ role: m.role, content: m.content }));

// 修复：只传用户消息
const messages = history
  .filter(m => m.role === "user")
  .map(m => ({ role: m.role, content: m.content }));
```

### 场景 5: 混合型输入正确分流
```
假设 (Given)  用户说"开会讨论了涨价，帮我建个待办明天问张总"
当   (When)   voice-action 分类为 mixed
那么 (Then)   指令部分创建待办"明天问张总"（经过清洗）
并且 (And)    记录部分"开会讨论了涨价"进入 digest 管道
并且 (And)    待办不重复（digest 不再从记录部分提取同一个 intend）
```

当前 mixed 型处理已基本正确（voice-action 执行 + digest 继续），依赖 `checkDuplicate` 关键词去重。模型升级 + 提示词改进后分流准确率会提升，本轮不做额外代码改动。

## 边界条件
- [ ] 纯 emoji / 超短文本（<= 4 字）— 不触发 classifyVoiceIntent，直接走 digest，不受影响
- [ ] AI 返回空 JSON / 非 JSON — safeParseJson 返回 null，保持现有降级逻辑
- [ ] `cleanActionPrefix` 过度清洗 — 清洗后为空则 fallback 到原文
- [ ] qwen3.5-plus reasoning:false 延迟 — 预期 1-3s/调用，vs qwen-plus 0.5-2s，可接受
- [ ] 对话只有 1-2 轮（history < 4）— 不触发 saveConversationAsRecord，不受影响

## 修改文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `gateway/src/ai/provider.ts` | **不改** | 实测 qwen3.5-plus reasoning:false 仍消耗 5000+ thinking tokens（110s），回退保留 qwen-plus。提示词重写后 qwen-plus 质量已足够 |
| `gateway/src/handlers/digest-prompt.ts` | **重写** | 提示词全面重写：角色改为提取器、nucleus 禁止规则、intend 动词开头、正反示例 |
| `gateway/src/handlers/voice-action.ts` | **重写提示词 + 代码** | CLASSIFY_PROMPT 重写（含 changes.text 必填约束 + 正反示例）、新增 cleanActionPrefix、safeParseJson |
| `gateway/src/handlers/digest.ts` | 修改 | `JSON.parse` → `safeParseJson` |
| `gateway/src/handlers/process.ts` | 修改 | `JSON.parse` → `safeParseJson` |
| `gateway/src/handlers/chat.ts` | 修改 | saveConversationAsRecord 只传用户消息 |

## 不改动
- 前端 `text-bottom-sheet` 入口不改 — voice-action 正确分流后，不需要前端判断
- `todo-projector.ts` 不改 — digest 输出质量提升后自然受益
- `create-todo.ts` tool 不改 — chat 工具链本身正常
- `time-estimator.ts` / `batch-analyze.ts` 不改 — 自动受益于 fast tier 模型升级

## 预期效果

| 维度 | 修复前 | 修复后 |
|------|--------|--------|
| 模型 | qwen-plus（指令遵循弱） | qwen3.5-plus reasoning:false（指令遵循强） |
| nucleus 质量 | 含 AI 推理/元语言 | 忠实用户原话，动词开头 |
| 意图分类 | 指令型常被误判为记录 | 提示词明确分类标准 + 模型能力提升 |
| 待办文本 | "帮我记一下明天开会"（含前缀） | "明天开会"（清洗后） |
| 对话存档 | AI 建议被提取为待办 | 只存用户消息 |
| JSON 鲁棒性 | 裸 JSON.parse 无防御 | safeParseJson 清理 think/markdown |

## 备注
- `safeParseJson` 已存在于 `gateway/src/lib/text-utils.ts`，内含 `<think>` 剥离 + markdown 代码块清理
- qwen3.5-plus 是推理模型，`isReasoningModel` 匹配 `/qwen3\.5/`，provider.ts 中 `reasoning: false` 会自动发送 `enable_thinking: false`
- 提示词质量是提取质量的核心杠杆，模型升级 × 提示词改进是乘法关系不是加法
