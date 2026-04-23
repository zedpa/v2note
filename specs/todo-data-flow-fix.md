---
status: superseded
superseded_by: "todo-system.md"
id: "todo-data-flow-fix"
domain: todo
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# 待办数据通路修复 — 前端字段映射 + API 类型 + goal_title

> 状态：✅ 已完成 | 优先级：P0（其他待办面板修复的前提）

## 概述
前端待办数据通路存在三处断裂：(1) useTodos hook 字段映射不全，(2) updateTodo API 类型签名缺字段，(3) 待办列表缺少关联目标名称。后端已经完整返回所有字段，前端丢了一半。

## 现状诊断

### 问题 1: useTodos() 字段映射不全
`features/todos/hooks/use-todos.ts:20-34` 手动 map 了部分字段，遗漏：
- `estimated_minutes` — Detail Sheet 时长显示为空
- `goal_id` — 目标关联断裂
- `level` — 无法区分 action/goal/project
- `status` — 目标状态无法显示
- `cluster_id` — 认知关联断裂
- `subtask_count` / `subtask_done_count` — 子任务数量不显示
- `priority` — 优先级信息丢失

**根因**：后端 `todoRepo.findByUser()` 用 `SELECT t.*` 返回全部字段，但前端 hook 手动挑字段构造对象，没挑全。

### 问题 2: updateTodo() API 类型签名不全
`shared/lib/api/todos.ts:14-26` 的 fields 参数只有 6 个字段，缺少：
- `domain` — Detail Sheet 无法更新领域
- `impact` — 无法更新影响度
- `level` — 无法更新层级
- `status` — 无法更新目标状态
- `ai_actionable` / `ai_action_plan` — 无法更新 AI 行动计划
- `parent_id` — 无法更新父任务关联

后端 `PATCH /api/v1/todos/:id` 已接受这些字段（`gateway/src/routes/todos.ts:57-68`）。

### 问题 3: 待办列表缺少 goal_title
`features/workspace/components/todo-workspace-view.tsx:520` 用 `(todo as any).goal_title`，但：
- 后端 `findByUser/findByDevice` SQL 是 `SELECT t.*`，不 JOIN 父 todo 的 text
- 前端 `TodoItem` 类型没有 `goal_title` 字段
- 结果：workspace 里每个待办的目标名永远为空

## 场景

### 场景 1: Detail Sheet 正确显示所有字段
```
假设 (Given)  用户有一个待办：domain="工作", impact=7, estimated_minutes=60,
              level=0, goal_id 指向"供应链优化"目标, ai_action_plan=["查资质","比价"]
当   (When)   用户在待办列表点击该待办，打开 Detail Sheet
那么 (Then)   显示：领域="工作", 影响度=🔥7, 时长=60m, AI步骤列表2项
并且 (And)    关联目标显示"供应链优化"
```

### 场景 2: Detail Sheet 保存全量字段
```
假设 (Given)  用户在 Detail Sheet 修改了时间、时长、优先级
当   (When)   用户点击保存
那么 (Then)   PATCH 请求包含所有修改的字段（不丢字段）
并且 (And)    重新拉取列表后修改已生效
```

### 场景 3: 待办列表显示关联目标名
```
假设 (Given)  待办 A 的 parent_id 指向 todo B（level=1, text="供应链优化"）
当   (When)   待办列表加载（workspace / todo-panel）
那么 (Then)   待办 A 行末显示标签"供应链优化"
并且 (And)    无 parent_id 的待办不显示目标标签
```

### 场景 4: 子任务计数显示
```
假设 (Given)  目标 G 有 5 个子任务，其中 3 个已完成
当   (When)   待办列表加载
那么 (Then)   目标 G 行显示"3/5"子任务进度
```

### 场景 5: createTodo 支持完整字段
```
假设 (Given)  用户在聊天中说"帮我加个待办：明天下午开会"
当   (When)   AI 调用 create_todo 工具创建待办
那么 (Then)   POST 请求可传入 domain, impact, goal_id, parent_id, level, status
并且 (And)    前端 createTodo() 类型支持这些字段
```

## 涉及文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `shared/lib/types.ts` | 修改 | `TodoItem` 增加 `goal_title?: string` |
| `shared/lib/api/todos.ts` | 修改 | `updateTodo` fields 补全所有后端接受的字段；`createTodo` fields 补全 |
| `features/todos/hooks/use-todos.ts` | 修改 | 删除手动 map，直接用后端返回的对象（字段已全覆盖） |
| `gateway/src/db/repositories/todo.ts` | 修改 | `findByUser/findByDevice` SQL 加 LEFT JOIN 拿 goal_title |

## 具体改动

### 1. `shared/lib/types.ts` — TodoItem 加 goal_title

```typescript
export interface TodoItem {
  // ... 现有字段不变 ...
  goal_title?: string | null   // 新增：父目标名称（JOIN 得到）
}
```

### 2. `shared/lib/api/todos.ts` — 补全类型签名

```typescript
export async function createTodo(fields: {
  text: string;
  record_id?: string;
  domain?: string;
  impact?: number;
  goal_id?: string;
  scheduled_start?: string;
  estimated_minutes?: number;
  parent_id?: string;
  level?: number;
  status?: string;
}): Promise<{ id: string }> {
  return api.post("/api/v1/todos", fields);
}

export async function updateTodo(
  id: string,
  fields: {
    text?: string;
    done?: boolean;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    estimated_minutes?: number | null;
    priority?: number;
    domain?: string;
    impact?: number;
    level?: number;
    status?: string;
    ai_actionable?: boolean;
    ai_action_plan?: string[];
    parent_id?: string | null;
  },
): Promise<void> {
  await api.patch(`/api/v1/todos/${id}`, fields);
}
```

### 3. `features/todos/hooks/use-todos.ts` — 去掉手动 map

```typescript
// 现在：手动挑 14 个字段构造 TodoItem（遗漏 7 个）
const items: TodoItem[] = data.map((t: any) => ({
  id: t.id, text: t.text, done: t.done, ...
}));

// 改为：后端 SELECT t.* 已返回全部字段，直接用
const items: TodoItem[] = data.map((t: any) => ({
  ...t,
  source: t.source ?? t.category ?? null,
}));
```

### 4. `gateway/src/db/repositories/todo.ts` — SQL 加 goal_title

```sql
-- findByUser / findByDevice 的 SELECT 增加：
SELECT t.*,
       COALESCE(sc.cnt, 0)::int AS subtask_count,
       COALESCE(sc.done_cnt, 0)::int AS subtask_done_count,
       p.text AS goal_title                                    -- 新增
FROM todo t
LEFT JOIN record r ON r.id = t.record_id
LEFT JOIN todo p ON p.id = t.parent_id AND p.level >= 1       -- 新增
LEFT JOIN LATERAL ( ... ) sc ON true
WHERE ...
```

## 不改动

- 后端路由 `gateway/src/routes/todos.ts` — 已完整接受所有字段，无需改
- `TodoItem` 类型定义 — 已有 `goal_id`, `level`, `status` 等字段，只缺 `goal_title`
- Detail Sheet 组件 — 数据通路打通后自然生效，不需要改 UI 逻辑

## 验收标准

1. `useTodos()` 返回的每个 TodoItem 包含全部后端字段（特别是 estimated_minutes, level, status, subtask_count）
2. `updateTodo()` 类型签名与后端 PATCH 接受的字段一一对应
3. 有 parent_id 且 parent.level>=1 的待办，列表中可通过 `todo.goal_title` 拿到目标名
4. 无 TypeScript 编译错误
