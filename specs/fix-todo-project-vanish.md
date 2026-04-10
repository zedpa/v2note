---
id: fix-todo-project-vanish
title: "Fix: 待办项目视图添加后消失"
status: completed
domain: todo
risk: medium
dependencies: ["todo-core.md"]
superseded_by: null
created: 2026-04-11
updated: 2026-04-11
---

# Fix: 待办项目视图添加后消失

## 概述
在项目视图中添加待办后，待办立即消失。根因是后端 `findByUser`/`findByDevice` SQL 查询包含 `AND t.parent_id IS NULL`，将所有有 `parent_id` 的待办（包括挂在项目下的任务）全部排除在 API 返回之外。

## Bug 现象
- 在项目视图中，点击项目卡片的"添加"按钮创建待办 → 提交后待办消失
- 项目详情页中添加待办 → 同样消失
- 已有的项目下属待办也不在列表中（项目卡片始终 0 个任务）

## 根因
`gateway/src/db/repositories/todo.ts` 的 `findByUser`（行 93）和 `findByDevice`（行 74）：
```sql
WHERE (r.user_id = $1 OR t.user_id = $1) AND t.parent_id IS NULL
```
`parent_id IS NULL` 的本意是排除子任务（subtask），但同时排除了挂在项目/目标（level>=1）下的行动任务（level=0）。

## 修复方案
将 `AND t.parent_id IS NULL` 改为 `AND (t.parent_id IS NULL OR p.id IS NOT NULL)`。

原理：查询已有 `LEFT JOIN todo p ON p.id = t.parent_id AND p.level >= 1`，当 parent 是项目/目标（level>=1）时 `p.id IS NOT NULL`，当 parent 是普通任务（subtask 的 parent）时 `p.id IS NULL`。这样：
- 无 parent 的独立任务 → 返回 ✅
- parent 是项目/目标的任务 → 返回 ✅
- parent 是普通任务的子任务 → 排除 ✅

### 场景 1.1: 在项目视图添加待办后应出现在项目�务列表中
```
假设 (Given)  用户已有一个活跃项目 P
当   (When)   用户在项目视图中向 P 添加一个待办 "新任务"
那么 (Then)   刷新后 "新任务" 出现在 P 的任务列表中
并且 (And)    API 返回的 todos 中包含 parent_id = P.id 的任务
```

### 场景 1.2: 已有项目下属待办应正常显示
```
假设 (Given)  数据库中存在 parent_id 指向项目的待办
当   (When)   前端调用 listTodos
那么 (Then)   这些待办应被返回
并且 (And)    buildProjectGroups 将它们分配到正确的项目组
```

### 场景 1.3: findByDevice 同样返回项目下属待办
```
假设 (Given)  设备 D 在数据库中有挂在项目下的待办（parent_id 指向 level>=1 的项目）
当   (When)   通过 device_id 调用 findByDevice(D)
那么 (Then)   这些待办应被返回
```

### 场景 1.4: 子任务仍应排除在主列表外
```
假设 (Given)  待办 A 有子任务 B（B.parent_id = A.id，A.level = 0）
当   (When)   前端调用 listTodos
那么 (Then)   A 应被返回
并且 (And)    B 不应出现在返回结果中（通过 subtasks API 单独获取）
```

### 场景 1.5: 项目本身（level>=1）不被错误纳入
```
假设 (Given)  数据库中有 level=1 的项目 P（parent_id IS NULL）
当   (When)   前端调用 listTodos
那么 (Then)   P 会被返回（与修复前行为一致，因 parent_id IS NULL）
并且 (And)    前端 buildProjectGroups 通过 t.level === 0 过滤，P 不会出现在任务列表中
备注：此行为修复前后不变，level 过滤由前端保证
```

## 验收行为（E2E 锚点）

### 行为 1: 项目视图添加待办不消失
1. 用户打开待办 tab，切换到项目视图
2. 用户点击某个项目卡片的"+"按钮
3. 输入 "测试任务" 并提交
4. 任务出现在该项目卡片的任务列表中
5. 刷新页面后任务仍存在

## 边界条件
- [x] 无 parent_id 的待办仍正常显示（独立任务 → "其他"分组）
- [x] 子任务不被错误返回到主列表
- [x] level >= 1 的项目/目标不被重复返回（已通过 goals API 单独获取）

## 影响范围
- `gateway/src/db/repositories/todo.ts` — `findByUser` + `findByDevice` 两个函数
- 前端无需改动（`buildProjectGroups` 已有正确的 parent_id 分桶逻辑）
