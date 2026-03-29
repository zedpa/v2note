# 子任务树

> 状态：✅ 已完成（后端+数据库，前端展示待设计稿对齐后补充）
> 优先级：P1 — 设计稿 10 要求，当前 Todo Detail 缺失

## 概述
支持 Todo 的层级关系（parent_id），让用户将复杂待办拆分为可执行的子步骤。AI 可通过 action_plan 自动建议子任务，用户可手动添加。

## 现状问题
1. 设计稿 10（Todo Detail Sheet）要求 sub-task 树，但 todo 表无 parent_id 字段
2. AI 生成的 `ai_action_plan`（JSONB 步骤列表）已存在但是纯文本展示，未映射为真正的子 todo
3. TodoDetailSheet 有"让 AI 帮忙"按钮但不能拆分子任务

## 场景

### 场景 1: 手动添加子任务
```
假设 (Given)  用户打开某个 Todo 的详情弹窗
当   (When)   用户点击"添加子任务"按钮
那么 (Then)   在子任务区域出现输入框
并且 (And)    输入文字后按回车，创建子 todo（parent_id = 当前 todo.id）
并且 (And)    子任务显示在父任务下方，缩进展示
```

### 场景 2: AI 自动拆分子任务
```
假设 (Given)  用户打开一个 ai_actionable 的 Todo 详情
当   (When)   用户点击"让 AI 帮忙拆分"
那么 (Then)   AI 将 ai_action_plan 中的步骤创建为子 todo
并且 (And)    每个子 todo 继承父任务的 domain 和 goal_id
并且 (And)    子任务按步骤顺序排列
```

### 场景 3: 子任务完成联动
```
假设 (Given)  一个父任务有 N 个子任务
当   (When)   所有子任务都标记为完成
那么 (Then)   父任务自动标记为完成
并且 (And)    触发 onTodoComplete 降低关联 Strike salience
```

### 场景 4: 部分完成进度
```
假设 (Given)  一个父任务有 5 个子任务，已完成 3 个
当   (When)   用户查看待办列表
那么 (Then)   父任务行显示进度指示器（3/5）
并且 (And)    父任务不自动勾选
```

### 场景 5: 子任务在列表中的展示
```
假设 (Given)  待办列表包含有子任务的 todo
当   (When)   用户查看待办列表
那么 (Then)   父任务行右侧显示子任务数量角标
并且 (And)    点击父任务展开/折叠子任务列表
并且 (And)    子任务不单独出现在顶层列表中
```

### 场景 6: 删除父任务
```
假设 (Given)  一个父任务有子任务
当   (When)   用户删除父任务
那么 (Then)   所有子任务一并删除（CASCADE）
```

## 边界条件
- [ ] 只支持一层子任务（不支持子任务的子任务）
- [ ] 子任务数量上限 20
- [ ] 父任务完成后又取消完成 → 子任务状态不变
- [ ] AI 拆分结果为空（简单任务无需拆分）→ 提示"这个任务已经足够具体"

## 接口约定

新增字段：
```sql
-- migration: 035_todo_subtask.sql
ALTER TABLE todo ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES todo(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_todo_parent ON todo(parent_id);
```

API 变更：
```typescript
// POST /api/v1/todos — 新增 parent_id 可选字段
{ text: string; parent_id?: string; ... }

// GET /api/v1/todos — 返回增加 subtask_count 和 subtask_done_count
interface Todo {
  // ...existing fields
  parent_id: string | null;
  subtask_count: number;      // 子任务总数
  subtask_done_count: number;  // 已完成子任务数
}

// GET /api/v1/todos/:id/subtasks — 新增
// 返回该 todo 的所有子任务
```

## 依赖
- todo 表 parent_id 字段（需新建 migration）
- `gateway/src/db/repositories/todo.ts` — 需支持 parent_id 查询
- `gateway/src/routes/todos.ts` — 需新增 subtasks 路由
- `features/todos/components/todo-detail-sheet.tsx` — 需增加子任务区域
- `features/todos/components/todo-panel.tsx` — 列表需支持展开/折叠

## 备注
- 只支持一层层级（parent_id 不能指向另一个有 parent_id 的 todo）
- 设计稿参考：`docs/designs/10-todo-detail-sheet.png`
- ai_action_plan 保留为建议文本，用户确认后才创建真正的子 todo
