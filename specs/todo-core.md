---
id: "050a"
title: "Todo System — Core & Logic"
status: completed
domain: todo
risk: medium
dependencies: ["strike-extraction.md"]
superseded_by: null
related: ["todo-ui.md"]
created: 2026-03-23
updated: 2026-04-04
---

# Todo System — Core & Logic (数据与逻辑层)

## 概述

待办是 V2Note "从认知到行动" 的核心环节。用户用自然语言（语音/文字）管理待办全生命周期：创建、修改、完成、查询、拆解。AI 自动提取时间、人物、优先级、父子关系，通过 Agent 工具层执行操作。

**核心原则：**
- 用户不需要手动填表单——说一句话就够
- AI 准确识别待办 vs 想法 vs 目标（粒度判断）
- Agent 主动管理（提醒、推迟建议、重复检测）

---

## 1. Core Data Flow (核心数据流)

> 来源: todo-data-flow-fix.md (✅ 已完成)

### 概述

前端待办数据通路修复：(1) useTodos hook 字段映射不全，(2) updateTodo API 类型签名缺字段，(3) 待办列表缺少关联目标名称。后端已经完整返回所有字段，前端需要完整映射。

### 1.1 前端类型定义

```typescript
/** 待办项（API 返回的完整字段，不再手动映射） */
export interface TodoDTO {
  id: string
  text: string
  done: boolean
  record_id: string | null
  created_at: string
  updated_at?: string

  // 调度
  scheduled_start: string | null      // ISO datetime
  scheduled_end: string | null
  estimated_minutes: number | null
  priority: number | null

  // 领域 & 影响
  domain: string | null               // '工作'|'学习'|'创业'|'家庭'|'健康'|'生活'|'社交'
  impact: number | null               // 1-10

  // AI
  ai_actionable: boolean
  ai_action_plan: string[] | null

  // 层级
  level: number                       // 0=行动, 1=目标, 2=项目
  parent_id: string | null
  cluster_id: string | null
  status: string                      // active|progressing|blocked|paused|completed|abandoned|suggested|dismissed|archived
  strike_id: string | null
  goal_id: string | null              // deprecated, 兼容旧数据

  // 计算字段（后端 JOIN）
  subtask_count: number
  subtask_done_count: number
  goal_title: string | null           // parent todo 的 text
}
```

### 场景 1.1: Detail Sheet 正确显示所有字段 <!-- ✅ completed -->
```
假设 (Given)  用户有一个待办：domain="工作", impact=7, estimated_minutes=60,
              level=0, goal_id 指向"供应链优化"目标, ai_action_plan=["查资质","比价"]
当   (When)   用户在待办列表点击该待办，打开 Detail Sheet
那么 (Then)   显示：领域="工作", 影响度=🔥7, 时长=60m, AI步骤列表2项
并且 (And)    关联目标显示"供应链优化"
```

### 场景 1.2: Detail Sheet 保存全量字段 <!-- ✅ completed -->
```
假设 (Given)  用户在 Detail Sheet 修改了时间、时长、优先级
当   (When)   用户点击保存
那么 (Then)   PATCH 请求包含所有修改的字段（不丢字段）
并且 (And)    重新拉取列表后修改已生效
```

### 场景 1.3: 待办列表显示关联目标名 <!-- ✅ completed -->
```
假设 (Given)  待办 A 的 parent_id 指向 todo B（level=1, text="供应链优化"）
当   (When)   待办列表加载（workspace / todo-panel）
那么 (Then)   待办 A 行末显示标签"供应链优化"
并且 (And)    无 parent_id 的待办不显示目标标签
```

### 场景 1.4: 子任务计数显示 <!-- ✅ completed -->
```
假设 (Given)  目标 G 有 5 个子任务，其中 3 个已完成
当   (When)   待办列表加载
那么 (Then)   目标 G 行显示"3/5"子任务进度
```

### 场景 1.5: createTodo 支持完整字段 <!-- ✅ completed -->
```
假设 (Given)  用户在聊天中说"帮我加个待办：明天下午开会"
当   (When)   AI 调用 create_todo 工具创建待办
那么 (Then)   POST 请求可传入 domain, impact, goal_id, parent_id, level, status
并且 (And)    前端 createTodo() 类型支持这些字段
```

### 1.2 API 层

```typescript
// shared/lib/api/todos.ts

export async function createTodo(params: {
  text: string
  scheduled_start?: string
  estimated_minutes?: number
  domain?: string
  impact?: number
  goal_id?: string
  parent_id?: string
  level?: number
  status?: string
  priority?: number
}): Promise<{ id: string }>

export async function updateTodo(id: string, params: Partial<Pick<TodoDTO,
  'text' | 'done' | 'scheduled_start' | 'scheduled_end' |
  'estimated_minutes' | 'priority' | 'domain' | 'impact' |
  'level' | 'status' | 'parent_id'
>>): Promise<void>

export async function deleteTodo(id: string): Promise<void>
export async function listTodos(): Promise<TodoDTO[]>
export async function listTodosByDate(date: string): Promise<TodoDTO[]>
export async function listProjects(): Promise<TodoDTO[]>
```

### 1.3 统一状态管理

```typescript
// features/todos/hooks/use-todo-store.ts
export function useTodoStore() {
  // 核心数据
  const [allTodos, setAllTodos] = useState<TodoDTO[]>([])
  const [projects, setProjects] = useState<TodoDTO[]>([])

  // 派生数据
  const todayTodos = useMemo(() => filterByDate(allTodos, selectedDate), ...)
  const timeSlotGroups = useMemo(() => groupByTimeSlot(todayTodos), ...)
  const projectGroups = useMemo(() => buildProjectGroups(allTodos, projects), ...)

  // 操作: refresh, toggle, create, update, remove
  return { allTodos, projects, todayTodos, timeSlotGroups, projectGroups, ... }
}
```

### 1.4 后端 SQL — goal_title JOIN <!-- ✅ completed -->

```sql
SELECT t.*,
       parent.text AS goal_title,
       COALESCE(sc.cnt, 0)::int AS subtask_count,
       COALESCE(sc.done_cnt, 0)::int AS subtask_done_count
FROM todo t
LEFT JOIN record r ON r.id = t.record_id
LEFT JOIN todo parent ON t.parent_id = parent.id AND parent.level >= 1
LEFT JOIN LATERAL (...) sc ON true
WHERE ...
```

### 场景 1.6: 编辑待办时间不产生时区偏移 <!-- ✅ completed (fix-todo-time-shift) -->
```
假设 (Given)  用户昨天在北京时区创建了一条 09:00 的待办
当   (When)   用户打开该待办的编辑面板
那么 (Then)   面板显示的时间为 09:00（而非 01:00）
并且 (And)    显示的日期与用户当初选择的日期一致
当   (When)   用户将时间改为 15:00 并保存
那么 (Then)   刷新后列表仍显示为当天 15:00
并且 (And)    待办不会被移动到前一天或错误时间
```

### 场景 1.7: 推迟凌晨待办保留日期 <!-- ✅ completed (fix-todo-time-shift) -->
```
假设 (Given)  一条待办的计划时间为北京时间 03:00（UTC 日期为前一天）
当   (When)   用户点击"推迟到明天"
那么 (Then)   新时间为次日 03:00（北京时间）
并且 (And)    工作区视图显示的时间仍为 03:00
并且 (And)    日期显示不倒退到前一天
```

### 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `shared/lib/types.ts` | TodoItem 增加 goal_title |
| `shared/lib/api/todos.ts` | updateTodo/createTodo fields 补全 |
| `features/todos/hooks/use-todos.ts` | 删除手动 map，直接用后端返回对象 |
| `gateway/src/db/repositories/todo.ts` | findByUser/findByDevice SQL 加 LEFT JOIN |

---

## 2. AI Extraction Logic (AI 提取逻辑)

> 来源: smart-todo.md (✅ 已完成), todo-extraction-quality.md (✅ 已完成)

### 2.1 粒度自动判断

```
假设 (Given)  用户说"我要做一个供应链管理系统"
当   (When)   Digest L1 判断粒度
那么 (Then)   AI 判断 = project（复合方向）
并且 (And)    创建 project goal + 建议 2-4 个子目标
并且 (And)    子目标 status='suggested'，用户可确认
```
<!-- ✅ completed -->

```
假设 (Given)  用户说"明天打个电话给张总"
当   (When)   Digest L1 判断粒度
那么 (Then)   AI 判断 = action（单步可完成）
并且 (And)    直接创建 todo，不创建 goal
```
<!-- ✅ completed -->

```
假设 (Given)  用户说"今年要把身体搞好"
当   (When)   Digest L1 判断粒度
那么 (Then)   AI 判断 = goal（多步、长期）
并且 (And)    创建 goal (status='active')
并且 (And)    扫描相关 Cluster 建立关联
```
<!-- ✅ completed -->

### 2.2 自然语言创建待办 <!-- ✅ completed -->

```
假设 (Given)  用户说"明天下午3点找张总确认报价，挺急的"
当   (When)   Digest L1 处理
那么 (Then)   提取：
      text = "找张总确认报价"
      scheduled_start = 明天 15:00
      person = 张总
      priority = high（"挺急的"）
      parent_goal = 自动匹配"供应商评估"（如存在）
并且 (And)    创建 Strike(intend, granularity=action) + todo 投影
并且 (And)    路路回复"已加到明天日程，下午3点提醒你。关联到了'供应商评估'目标。"
```

### 2.3 语音管理已有待办 <!-- ✅ completed -->

```
假设 (Given)  用户说"把找张总那个事推迟到下周一"
当   (When)   Agent 处理
那么 (Then)   search({ query: "找张总", scope: "todos" }) 找到目标 todo
并且 (And)    update_todo({ scheduled_start: 下周一 })
并且 (And)    路路回复"已推迟到下周一。"
```

### 2.4 批量创建子任务 <!-- ✅ completed -->

```
假设 (Given)  用户说"给供应商评估加几个子任务：查资质、比价格、验质量"
当   (When)   Agent 处理
那么 (Then)   search 找到"供应商评估" goal
并且 (And)    批量创建 3 个 todo（parent_goal = 供应商评估）
并且 (And)    每个 todo 都有对应的 intend Strike
并且 (And)    路路回复确认清单
```

### 2.5 目标拆解（Plan 驱动） <!-- ✅ completed -->

```
假设 (Given)  用户说"帮我把Q2产品发布拆解一下"
当   (When)   Agent 进入 Plan 模式
那么 (Then)   Step 1: search 找到目标
并且 (And)    Step 2: AI 基于相关 Cluster 生成子目标+待办方案
并且 (And)    Step 3: 呈现方案卡片，等待确认（阻断点）
并且 (And)    Step 4: 用户确认/修改后 batch 创建
并且 (And)    每个创建的项都有 Strike 锚点
```

### 2.6 提取质量修复

#### 2.6.1 AI 思考标签清理 <!-- ✅ completed -->
```
假设 (Given)  qwen3.5-plus 偶尔返回包含 <think>...</think> 或 ```json ``` 的响应
当   (When)   digest / process / voice-action 解析 AI 响应
那么 (Then)   自动剥离 <think> 标签和 markdown 代码块后再解析 JSON
并且 (And)    使用已有的 safeParseJson 替代裸 JSON.parse
```

#### 2.6.2 digest 提示词 — 提升 Strike 提取质量 <!-- ✅ completed -->
```
假设 (Given)  用户说"今天开会讨论了涨价，提醒我明天问张总报价"
当   (When)   digest AI 提取 Strike
那么 (Then)   nucleus 为"明天问张总确认报价"（用户原话提炼，动词开头）
并且 (And)    不包含"根据用户描述，可以推断…"等 AI 元语言
并且 (And)    不包含"这是一个行动意图"等分类说明文字
并且 (And)    intend Strike 的 field 字段完整（granularity, scheduled_start, person）
```

提示词核心改进:
- 角色定位从"认知分析引擎"改为"认知记录提取器"
- nucleus 禁止规则：❌ "用户认为…" "这表明…" "分析可得…"
- intend nucleus 格式：动词开头，可直接执行/追踪的短句

#### 2.6.3 voice-action 提示词 — 意图分类与文本提取 <!-- ✅ completed -->
```
假设 (Given)  用户说"帮我记一下明天去开会"
当   (When)   voice-action AI 分类为 create_todo
那么 (Then)   changes.text = "明天去开会"（纯净待办内容，动词开头）
并且 (And)    不是整句"帮我记一下明天去开会"
```

新增 `cleanActionPrefix()` 清洗指令前缀（帮我/提醒我/记一下/别忘了）。

#### 2.6.4 chat 对话存档只保留用户内容 <!-- ✅ completed -->
```
假设 (Given)  用户与 AI 进行了多轮对话（history.length >= 4）
当   (When)   endChat() 保存对话为 record 进入 digest 管道
那么 (Then)   只保存用户消息（role=user），排除 AI 回复
并且 (And)    digest 不会从 AI 建议中提取出虚假的 intend Strike
```

#### 2.6.5 混合型输入正确分流 <!-- ✅ completed -->
```
假设 (Given)  用户说"开会讨论了涨价，帮我建个待办明天问张总"
当   (When)   voice-action 分类为 mixed
那么 (Then)   指令部分创建待办"明天问张总"（经过清洗）
并且 (And)    记录部分"开会讨论了涨价"进入 digest 管道
并且 (And)    待办不重复（digest 不再从记录部分提取同一个 intend）
```

### 2.7 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `gateway/src/handlers/digest-prompt.ts` | 提示词全面重写 |
| `gateway/src/handlers/voice-action.ts` | CLASSIFY_PROMPT 重写 + cleanActionPrefix + safeParseJson |
| `gateway/src/handlers/digest.ts` | JSON.parse → safeParseJson |
| `gateway/src/handlers/process.ts` | JSON.parse → safeParseJson |
| `gateway/src/handlers/chat.ts` | saveConversationAsRecord 只传用户消息 |

### 边界条件
- [x] 极短待办（"买菜"2 字）：仍然有效，不拒绝
- [x] 时间识别模糊（"回头"）：不设时间，不硬猜
- [x] 人名识别错误：允许用户在待办详情中修正
- [x] 批量创建上限：单次 Plan 最多 10 个子任务
- [x] 纯 emoji / 超短文本（<= 4 字）— 不触发 classifyVoiceIntent，直接走 digest
- [x] AI 返回空 JSON / 非 JSON — safeParseJson 返回 null，保持降级逻辑
- [x] cleanActionPrefix 过度清洗 — 清洗后为空则 fallback 到原文

---

## 3. Deduplication (去重)

> 来源: todo-dedup.md (✅ completed)

### 核心规则
- 新建 todo 时，先用 embedding 与用户已有未完成 todo 做余弦相似度比较
- 相似度 >= 0.65 → 视为重复，返回已有 todo，不创建新记录
- 相似度 < 0.65 → 正常创建
- embedding 获取失败时降级为直接创建（不阻塞）

### 覆盖路径
1. REST `POST /api/v1/todos`
2. AI 工具 `create_todo`
3. 语音动作 `executeCreateTodo`
4. `confirm` 工具 `promote_todo`
5. `todo-projector` Strike 行动级 todo

### 场景 3.1: 相似度 >= 0.65 视为重复 <!-- ✅ completed -->

```
假设 (Given)  用户已有未完成 todo "联系张总确认合同"
当   (When)   用户输入新 todo "联系张总确认合同细节"，向量相似度 0.72
那么 (Then)   返回已有 todo，action = "matched"，不插入新记录
```

### 场景 3.2: 相似度 < 0.65 正常创建 <!-- ✅ completed -->

```
假设 (Given)  用户已有未完成 todo "联系张总确认合同"
当   (When)   用户输入新 todo "去超市买菜"，向量相似度 0.15
那么 (Then)   正常创建新 todo，action = "created"
```

### 场景 3.3: 无已有 todo 直接创建 <!-- ✅ completed -->

```
假设 (Given)  用户无任何未完成 todo
当   (When)   用户创建新 todo
那么 (Then)   正常创建，action = "created"
```

### 场景 3.4: embedding 失败降级 <!-- ✅ completed -->

```
假设 (Given)  向量服务不可用
当   (When)   用户创建新 todo
那么 (Then)   降级直接创建，不报错
```

### 场景 3.5: 已完成 todo 不参与去重 <!-- ✅ completed -->

```
假设 (Given)  用户有已完成 todo "联系张总确认合同"（done=true）
当   (When)   用户创建相同文本的新 todo
那么 (Then)   正常创建（不与已完成 todo 去重）
```

### 接口约定

```typescript
// todo.ts 新增
export async function dedupCreate(
  fields: CreateFields,
): Promise<{ todo: Todo; action: "created" | "matched" }>
```

---

## 4. Time Parsing (时间解析)

> 来源: todo-time-accuracy.md (🟡 待开发)

### 概述
修复待办时间解析不准确的问题：用户说"明天干XX"设到今天，"周末干XX"设到周六。根因是 LLM 提示词中时间计算指令不明确、三条创建路径各自处理时间。

### 4.1 共享时间锚点 — buildDateAnchor()

新建 `gateway/src/lib/date-anchor.ts`：

```typescript
/**
 * 生成预计算时间锚点查找表，嵌入 LLM prompt。
 * LLM 直接查表，禁止自行做日期算术。
 */
export function buildDateAnchor(): string
```

输出示例（2026-04-02 周三调用）：
```
## 时间锚点（直接查表，禁止自行计算）

当前：2026-04-02（周三）

| 用户说 | 日期 |
|--------|------|
| 今天 | 2026-04-02 |
| 明天 | 2026-04-03 |
| 后天 | 2026-04-04 |
| 大后天 | 2026-04-05 |
| 这周六/周六 | 2026-04-04 |
| 周末/这周日/周日 | 2026-04-05 |
| 下周一 | 2026-04-06 |
| 下周五 | 2026-04-10 |
| 月底 | 2026-04-30 |

输出格式：ISO 8601
- 有具体时间："2026-04-03T15:00:00"
- "上午" → T09:00:00
- "下午" → T14:00:00
- "晚上" → T20:00:00
- 仅日期无具体时间 → T09:00:00（默认上午）
- "这周之内""月底前" → 写入 deadline，不是 scheduled_start
- 无任何时间信号 → 不填 scheduled_start
```

### 场景 4.1: 预计算时间锚点嵌入提示词
```
假设 (Given)  当前日期为 2026-04-02（周三）
当   (When)   任一 LLM prompt 需要时间上下文
那么 (Then)   调用 buildDateAnchor() 生成预计算查找表嵌入 prompt
并且 (And)    查找表包含：今天、明天、后天、大后天、本周六、本周日、下周一、月底
并且 (And)    LLM 直接查表获取绝对日期，禁止自行计算
```

### 场景 4.2: "周末"映射规则
```
假设 (Given)  用户说"周末去做XX"
当   (When)   LLM 查找时间锚点
那么 (Then)   "周末" = 本周日（周日）
并且 (And)    "这周六" = 本周六（区分于"周末"）
```

### 场景 4.3: 已过日期自动顺延
```
假设 (Given)  今天是周日
当   (When)   用户说"周末做XX"
那么 (Then)   "周末" 指下周日（不指今天）
```

### 场景 4.4: 默认时间兜底
```
假设 (Given)  用户说"明天找张总"（无具体时间点）
当   (When)   LLM 提取 scheduled_start
那么 (Then)   scheduled_start = "2026-04-03T09:00:00"（默认上午9点）
并且 (And)    而不是留空或只写日期
```

### 4.2 三条路径统一引用时间锚点

#### 场景 4.5: Digest 路径注入锚点
```
假设 (Given)  digest-prompt.ts 的 buildDigestPrompt() 生成提取 prompt
当   (When)   用户说"明天下午3点找张总确认报价"
那么 (Then)   prompt 包含 buildDateAnchor() 输出的查找表
并且 (And)    LLM 从表中查到"明天 = 2026-04-03"，输出 "2026-04-03T15:00:00"
```

#### 场景 4.6: Voice Action 路径注入锚点
```
假设 (Given)  voice-action.ts 的 buildClassifyPrompt() 生成分类 prompt
当   (When)   用户说"提醒我后天下午开会"
那么 (Then)   prompt 包含 buildDateAnchor() 输出的查找表
并且 (And)    LLM 从表中查到"后天 = 2026-04-04"
并且 (And)    返回 changes.scheduled_start = "2026-04-04T14:00:00"
```

#### 场景 4.7: Chat Tool 路径注入锚点
```
假设 (Given)  用户在对话中说"帮我建个待办，下周一交报告"
当   (When)   chat AI 调用 create_todo tool
那么 (Then)   system prompt 包含 buildDateAnchor() 输出的查找表
并且 (And)    AI 传入 scheduled_start = "2026-04-06T09:00:00"（下周一）
```

### 4.3 Voice Action 待办创建统一走 tool handler

#### 场景 4.8: voice-action 复用 tool handler
```
假设 (Given)  voice-action 分类为 create_todo
当   (When)   executeCreateTodo() 执行
那么 (Then)   调用 createTodoTool.handler() 而非直接调 todoRepo
并且 (And)    scheduled_start、priority 正确写入数据库
并且 (And)    自动创建关联 record（如无 recordId）
并且 (And)    自动写入 embedding（与 Chat tool 一致）
```

#### 场景 4.9: Digest 投影路径保持独立
```
假设 (Given)  todo-projector.ts 的 projectIntendStrike() 从 Strike 创建待办
当   (When)   intend Strike 投影为 todo
那么 (Then)   不走 createTodoTool.handler（需要 strike_id 关联 + 事件总线）
并且 (And)    受益于时间锚点 prompt 改进
```

### 涉及文件

| 文件 | 操作 |
|------|------|
| `gateway/src/lib/date-anchor.ts` | **新建** — 共享时间锚点 |
| `gateway/src/handlers/digest-prompt.ts` | 改 — 引用 buildDateAnchor |
| `gateway/src/handlers/voice-action.ts` | 改 — 引用 buildDateAnchor + executeCreateTodo 走 tool handler |
| `gateway/src/skills/prompt-builder.ts` | 改 — hot tier 注入时间锚点 |

### 边界条件
- [ ] 跨午夜：用户 23:59 说"今天"，服务器时间已是次日 → buildDateAnchor 基于服务器时间，可能差一天（可接受）
- [ ] "下下周" / "下个月15号" — 不在预计算表中 → prompt 指示"不在表中的相对时间，基于当前日期手动计算"
- [ ] 用户说的时间已过（"昨天"）→ LLM 应如实输出昨天日期，不做顺延
- [ ] 时区问题 — 暂用服务器时区，后续可用客户端时区修正

---

## 5. Subtasks (子任务)

> 来源: todo-subtask.md (✅ 后端+数据库已完成，前端展示待设计稿对齐后补充)

### 概述
支持 Todo 的层级关系（parent_id），让用户将复杂待办拆分为可执行的子步骤。AI 可通过 action_plan 自动建议子任务，用户可手动添加。

### 场景 5.1: 手动添加子任务 <!-- ✅ completed (backend) -->
```
假设 (Given)  用户打开某个 Todo 的详情弹窗
当   (When)   用户点击"添加子任务"按钮
那么 (Then)   在子任务区域出现输入框
并且 (And)    输入文字后按回车，创建子 todo（parent_id = 当前 todo.id）
并且 (And)    子任务显示在父任务下方，缩进展示
```

### 场景 5.2: AI 自动拆分子任务 <!-- ✅ completed (backend) -->
```
假设 (Given)  用户打开一个 ai_actionable 的 Todo 详情
当   (When)   用户点击"让 AI 帮忙拆分"
那么 (Then)   AI 将 ai_action_plan 中的步骤创建为子 todo
并且 (And)    每个子 todo 继承父任务的 domain 和 goal_id
并且 (And)    子任务按步骤顺序排列
```

### 场景 5.3: 子任务完成联动 <!-- ✅ completed (backend) -->
```
假设 (Given)  一个父任务有 N 个子任务
当   (When)   所有子任务都标记为完成
那么 (Then)   父任务自动标记为完成
并且 (And)    触发 onTodoComplete 降低关联 Strike salience
```

### 场景 5.4: 部分完成进度 <!-- ✅ completed (backend) -->
```
假设 (Given)  一个父任务有 5 个子任务，已完成 3 个
当   (When)   用户查看待办列表
那么 (Then)   父任务行显示进度指示器（3/5）
并且 (And)    父任务不自动勾选
```

### 场景 5.5: 子任务在列表中的展示
```
假设 (Given)  待办列表包含有子任务的 todo
当   (When)   用户查看待办列表
那么 (Then)   父任务行右侧显示子任务数量角标
并且 (And)    点击父任务展开/折叠子任务列表
并且 (And)    子任务不单独出现在顶层列表中
```

### 场景 5.6: 删除父任务 <!-- ✅ completed (backend) -->
```
假设 (Given)  一个父任务有子任务
当   (When)   用户删除父任务
那么 (Then)   所有子任务一并删除（CASCADE）
```

### 接口约定

```sql
-- migration: 035_todo_subtask.sql
ALTER TABLE todo ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES todo(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_todo_parent ON todo(parent_id);
```

```typescript
// API
POST /api/v1/todos — 新增 parent_id 可选字段
GET  /api/v1/todos — 返回 subtask_count, subtask_done_count
GET  /api/v1/todos/:id/subtasks — 该 todo 的所有子任务
```

### 边界条件
- [x] 只支持一层子任务（不支持子任务的子任务）
- [x] 子任务数量上限 20
- [ ] 父任务完成后又取消完成 → 子任务状态不变
- [ ] AI 拆分结果为空（简单任务无需拆分）→ 提示"这个任务已经足够具体"

---

## 6. Strike Bridge (认知关联)

> 来源: todo-strike-bridge.md (✅ completed)

### 概述
Todo 和 Goal 与 Strike/Bond/Cluster 建立数据桥梁：todo.strike_id 关联源 intend Strike，goal.cluster_id 指向对应 Cluster，创建流程统一为 Digest 产出 intend Strike → 自动投影为 todo/goal。

### 场景 6.1: intend Strike 自动投影为 todo <!-- ✅ completed -->
```
假设 (Given)  Digest L1 产出 Strike(polarity='intend', granularity='action')
当   (When)   Strike 写入数据库
那么 (Then)   自动创建 todo（strike_id 指向该 Strike）
并且 (And)    todo 继承 Strike 的上下文：时间、人物、优先级从 nucleus 提取
并且 (And)    时间线中该日记卡片底部显示"📌 已创建待办"
```

### 场景 6.2: 已有 todo 回补 Strike 关联 <!-- ✅ completed -->
```
假设 (Given)  存量 todo 1000 条，无 strike_id
当   (When)   执行数据迁移
那么 (Then)   对每条 todo 用 embedding 匹配最相关的 intend Strike
并且 (And)    匹配度 > 0.7 的自动关联
并且 (And)    匹配度低的保持 strike_id=null（不强制）
```

### 场景 6.3: goal 关联 Cluster <!-- ✅ completed -->
```
假设 (Given)  存量 goal 10 条
当   (When)   执行数据迁移
那么 (Then)   对每条 goal 用 embedding 匹配最相关的 Cluster
并且 (And)    写入 goal.cluster_id
```

### 场景 6.4: 双向一致性 <!-- ✅ completed -->
```
假设 (Given)  todo 被标记完成
当   (When)   状态更新
那么 (Then)   关联的 intend Strike 的 salience 降低
并且 (And)    如果该 Strike 属于某个 goal 的 Cluster，goal 的完成率自动更新
```

### 场景 6.5: Strike 删除保护 <!-- ✅ completed -->
```
假设 (Given)  某 intend Strike 有 todo 投影
当   (When)   maintenance 尝试 archive 该 Strike
那么 (Then)   如果关联 todo 仍 active，Strike 不被 archive
并且 (And)    Strike 的 salience 衰减正常进行但不低于 0.1
```

### 数据库变更
- todo 表: `strike_id UUID REFERENCES strike(id)` (nullable)
- goal 表: `cluster_id UUID REFERENCES strike(id)` (nullable, is_cluster=true)

### 涉及文件

| 文件 | 改动类型 |
|------|---------|
| migration | todo.strike_id + goal.cluster_id |
| `gateway/src/db/repositories/todo.ts` | TodoItem 加 strike_id |
| `gateway/src/db/repositories/goal.ts` | Goal 加 cluster_id |
| `gateway/src/handlers/digest.ts` | intend Strike 创建后自动投影 todo |

---

## 依赖

- `strike-extraction.md` — intend Strike 提取逻辑
- `emergence-chain` — level 字段定义

## 备注

- 本文件从 todo-system.md 拆分而来，包含数据流、AI 提取、去重、时间解析、子任务、Strike 关联等核心逻辑
- safeParseJson 已存在于 `gateway/src/lib/text-utils.ts`
- AI 调用次数：粒度判断/时间提取/人物提取合并到 Digest L1 prompt 中（0 次额外调用），目标拆解 1 次/Plan，重复检测 0 次（embedding 匹配）
- 只支持一层子任务层级
