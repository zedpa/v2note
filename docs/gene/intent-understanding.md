# gene_intent_understanding — 意图理解系统

## 概述

从"提取待办"升级为"理解用户"。引入意图分类层，区分可立即执行的任务与需要确认的愿望/目标，用目标树替代 `[目标]` memory hack。

## 五种意图类型

| type | 判断标准 | AI 动作 |
|------|---------|---------|
| `task` | 主体+动作+客体齐全 | 直接创建 todo |
| `wish` | "我想/想要/希望" + 无明确下一步 | 暂存 pending_intent，等确认 |
| `goal` | 较大目标，有时间维度或可衡量 | 暂存 pending_intent，等确认 |
| `complaint` | 负面情绪、抱怨 | 由 soul 系统自然吸收 |
| `reflection` | 自我反思、领悟 | 由 memory 系统存储 |

## 数据库

**Migration**: `supabase/migrations/011_goals.sql`

### goal 表
```
id, device_id, title, parent_id(自引用), status(active/paused/completed/abandoned), source(speech/chat/manual), created_at, updated_at
```

### pending_intent 表
```
id, device_id, record_id, intent_type(wish/goal/complaint/reflection), text, context, status(pending/confirmed/dismissed/promoted), promoted_to, created_at
```

### todo 扩展
```
todo.goal_id → goal(id) ON DELETE SET NULL
```

## 技能

### intent-classify (主力)
- 路径: `gateway/skills/intent-classify/SKILL.md`
- `always: true`，替代 todo-extract
- 输出 `intents` 数组，每个元素含 `type`, `text`, `context?`

### todo-extract (降级)
- `always: false`，作为 fallback 保留
- 当 intent-classify 不可用时走旧逻辑

## Gateway 处理流程

### Process Handler (`gateway/src/handlers/process.ts`)

1. AI 返回 `intents` 数组时使用新格式；返回 `todos` 数组时走旧格式 fallback
2. `task` 类型 → 填入 `result.todos`（向后兼容）→ 写入 todo 表
3. `wish`/`goal` 类型 → 写入 pending_intent 表
4. `complaint` → 已在 updateSoul 中处理
5. `reflection` → 已在 maybeCreateMemory 中处理
6. 创建 todo 后，用 extractKeywords 匹配活跃目标，自动设置 goal_id

### Chat Handler (`gateway/src/handlers/chat.ts`)

- startChat 时加载 pending intents（最多 5 条）
- 注入到 system prompt warm tier，引导 AI 自然跟进
- 提供 `create_goal` 和 `confirm_intent` 两个内置工具

## 内置工具

### create_goal
- 参数: `title` (必填), `parent_id` (可选)
- 创建目标，source 为 "chat"

### confirm_intent
- 参数: `intent_id` (必填), `action` (必填: promote_goal/promote_todo/dismiss)
- `promote_goal`: 创建 goal，更新 intent 状态为 promoted
- `promote_todo`: 创建 todo，更新 intent 状态为 promoted
- `dismiss`: 更新 intent 状态为 dismissed

## 上下文系统

### LoadedContext 扩展
- 新增 `goals: Array<{ id: string; title: string }>` 字段
- `loadWarmContext` 并行加载 soul + memories + goals

### 记忆降级规则
- 当 goal 表有数据时，`[目标]` 前缀的 memory 不再享受优先排名，按普通 memory 处理
- 当 goal 表为空时，保持旧行为（[目标] memory 始终浮出）

### Todo Enrichment
- 优先从 goal 表获取目标上下文，而非过滤 `[目标]` memory

## 共享模块

### extractKeywords (`gateway/src/lib/text-utils.ts`)
- 从 `context/loader.ts` 提取为独立模块
- 导出 `extractKeywords(text)` 和 `STOPWORDS`
- 用于：context loader 记忆评分、process handler 目标关联

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/goals` | 活跃目标列表 |
| POST | `/api/v1/goals` | 创建目标 |
| PATCH | `/api/v1/goals/:id` | 更新目标 |
| GET | `/api/v1/goals/:id/todos` | 目标关联的待办 |
| GET | `/api/v1/intents/pending` | 待确认意图列表 |

## 前端

### GoalsTab (`features/todos/components/todo-panel.tsx`)
- 优先调用 `listGoals()` 获取 goal 表数据
- goal 表为空时 fallback 到 `listMemories` 过滤 `[目标]`
- 展示目标来源（语音/对话/手动）和状态

### 前端 API (`shared/lib/api/goals.ts`)
- `listGoals()`, `createGoal()`, `updateGoal()`, `listGoalTodos()`, `listPendingIntents()`

## 关键文件

| 文件 | 职责 |
|------|------|
| `supabase/migrations/011_goals.sql` | DB schema |
| `gateway/src/db/repositories/goal.ts` | Goal CRUD |
| `gateway/src/db/repositories/pending-intent.ts` | PendingIntent CRUD |
| `gateway/skills/intent-classify/SKILL.md` | 意图分类技能 |
| `gateway/src/lib/text-utils.ts` | extractKeywords 共享 |
| `gateway/src/routes/goals.ts` | REST 路由 |
| `gateway/src/handlers/process.ts` | 意图解析+路由 |
| `gateway/src/handlers/chat.ts` | 待确认意图注入 |
| `gateway/src/tools/builtin.ts` | create_goal + confirm_intent |
| `shared/lib/api/goals.ts` | 前端 API |
| `shared/lib/types.ts` | Goal + PendingIntent 类型 |
| `features/todos/components/todo-panel.tsx` | GoalsTab UI |
