---
id: fix-record-delete-strike
title: "Fix: 删除日记卡片报错 relation 'strike' does not exist"
status: completed
domain: infra
risk: low
created: 2026-04-12
---

# Fix: 删除日记卡片报错 relation "strike" does not exist

## Bug 现象

用户在前端删除日记卡片时，弹出错误提示「删除失败：relation "strike" does not exist」。

## 复现条件

- 任意日记卡片
- 点击删除（通过卡片菜单或选中后删除）
- 后端 deleteByIds 尝试 `DELETE FROM strike WHERE source_id IN (...)` 报错

## 根因分析

`supabase/migrations/064_drop_strike_system.sql` 已删除 `strike` 表，但 `gateway/src/db/repositories/record.ts` 的 `deleteByIds()` 仍在执行 `DELETE FROM strike` SQL。

## 修复方案

全面清理所有引用已删除 strike/bond 表的代码：
1. `record.ts:deleteByIds()` — 删除 strike DELETE 语句
2. `maintenance.ts` — 4 个函数改为 no-op
3. `knowledge-lifecycle.ts` — 3 个函数改为 no-op
4. `goal-auto-link.ts` — 3 处 strike SQL 改为基于 wiki_page
5. `proactive/engine.ts` — strike 查询改为 wiki_page 查询
6. `todo.ts` — 删除 strike_id 字段、getMyWorldData 改用 wiki_page
7. `todo-types.ts` — 前端类型删除 strike_id
8. 5 个测试文件 — 删除 strike_id mock

## 场景

### S1: 正常删除日记

- **Given** 用户有一条日记记录
- **When** 用户执行删除操作
- **Then** 日记被成功删除，无报错

### S2: 批量删除日记

- **Given** 用户选中多条日记
- **When** 执行批量删除
- **Then** 所有选中日记被成功删除

## 验收行为（E2E 锚点）

1. 打开日记视图
2. 对一条日记执行删除操作
3. 确认删除成功，日记从列表消失，无错误提示

## 附注：其他 strike 表残留引用

以下文件仍引用 strike 表，可能在对应功能触发时报同样错误，建议后续清理：
- `gateway/src/cognitive/maintenance.ts`
- `gateway/src/cognitive/goal-auto-link.ts`
- `gateway/src/cognitive/knowledge-lifecycle.ts`
- `gateway/src/db/repositories/todo.ts`
- `gateway/src/proactive/engine.ts`
