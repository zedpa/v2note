---
id: "083"
title: "目标自动拆解与关联"
status: active
domain: goal
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 目标自动拆解与关联

> 状态：✅ completed | 优先级：Phase 4 | 预计：3-4 天
> 依赖：goal-granularity

## 概述
目标创建后（无论涌现还是手动），需要立刻和已有的认知数据建立关联。用户期望"说了一句话，系统就帮我找到所有相关的东西"。

## 场景

### 场景 1: 目标创建后全量关联扫描
```
假设 (Given)  新目标 "评估是否换供应商" 被创建
当   (When)   系统执行 goalAutoLink(goalId)
那么 (Then)   找到语义相关的 Cluster → 建立关联
并且 (And)    找到相关历史日记 → 标记为该目标相关记录
并且 (And)    找到相关 todo → 关联到该目标
并且 (And)    目标详情立刻显示 "12条相关记录、3个待办"
```

### 场景 2: 新日记自动关联已有目标
```
假设 (Given)  用户有 active 目标 "评估供应商"
并且 (And)    用户录入新日记提到供应商相关内容
当   (When)   Digest L1 完成
那么 (Then)   新 Strike embedding 和 goal Cluster embedding 匹配
并且 (And)    匹配度 > 0.6 时自动关联到该目标
并且 (And)    目标的"相关记录"计数 +1
```

### 场景 3: 目标健康度四要素自动计算
```
假设 (Given)  目标 "评估供应商" 有 12 条相关日记、3 个 todo
当   (When)   请求目标健康度 GET /api/v1/goals/:id/health
那么 (Then)   计算四维度分数 (0-100):
      方向 = 有明确 intend Strike 指向？
      资源 = 有 perceive Strike 含可用信息？
      路径 = 有具体 todo 且在执行？
      驱动 = 有 feel/judge Strike 表达动机？
```

### 场景 4: 项目级子目标进度汇总
```
假设 (Given)  项目 "Q2供应链重建" 有 3 个子目标
并且 (And)    子目标1 有 2 个 todo 已完成
并且 (And)    子目标2 有 1 个 todo 被跳过 3 次
当   (When)   查看项目卡片
那么 (Then)   显示汇总进度条
并且 (And)    子目标2 标记橙色（有阻力）
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新建 `gateway/src/cognitive/goal-linker.ts` | 全量关联 + 增量关联 + 健康度 |
| `gateway/src/routes/goals.ts` | 新增：GET /goals/:id/health |
| `features/goals/components/goal-detail.tsx` | 修改：渲染健康度 + 关联记录 |

## AI 调用
- 全量关联：0 次（embedding 匹配）
- 健康度计算：0 次（规则计算）

## 验收标准
目标创建 5 秒后，详情页立刻有相关记录和待办，健康度四维条有值。
