# 顶层维度——统一模型实现

> 状态：✅ 已完成 | 优先级：Phase 3
> 2026-03-29: seedDimensionGoals 创建种子目标（level=1 todo with domain）
> 2026-03-30: 删除死代码 top-level.ts + 添加测试覆盖 + 修复种子目标质量
>
> 架构决策：维度 = todo.domain（统一模型），不再使用 Strike level=3 Cluster

## 概述
纯涌现导致冷启动期侧边栏空白。方案：冷启动 Q2 回答后关键词匹配预设维度库，创建带 domain 的种子目标（level=1 todo），保证侧边栏"我的世界"立即有内容。后续由 batch-analyze AI 自动为新聚类分配 domain。

## 场景

### 场景 1: 冷启动完成后生成种子维度
```
假设 (Given)  用户完成冷启动 Q2 回答："我在铸造厂上班，业余做自己的产品，偶尔炒炒币"
当   (When)   onboarding handler 调用 seedDimensionGoals
那么 (Then)   关键词匹配生成 3-5 个种子目标：如"工作""创业""投资""生活"
并且 (And)    每个维度创建 level=1 todo（domain 字段已填）
并且 (And)    侧边栏"我的世界"立刻显示维度骨架
并且 (And)    至少保证有"生活"维度（兜底）
```

### 场景 2: 新日记自动获得 domain
```
假设 (Given)  用户录入一条关于供应链的日记
当   (When)   Digest L1 提取 todo → time-estimator 丰富
那么 (Then)   AI 为 todo 分配 domain（如"工作"）
并且 (And)    todo 自动归入对应维度分组
```

### 场景 3: batch-analyze 为聚类分配 domain
```
假设 (Given)  累计 5+ 个新 Strike
当   (When)   Tier2 batch-analyze 触发
那么 (Then)   AI prompt 中已传入 dimensions 列表
并且 (And)    AI 为每个 cluster 分配最匹配的 domain
并且 (And)    侧边栏维度下的目标/聚类数量增长
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `gateway/src/handlers/onboarding.ts` | seedDimensionGoals：关键词匹配→创建种子目标 |
| `gateway/src/cognitive/batch-analyze-prompt.ts` | Tier2 prompt 传入 dimensions 列表 |
| `gateway/src/proactive/time-estimator.ts` | 新 todo 的 domain 分配 |
| ~~`gateway/src/cognitive/top-level.ts`~~ | 已删除（死代码，统一模型替代） |

## AI 调用
- 种子维度生成：0 次（纯关键词匹配）
- 新 todo domain 分配：0 次（合并在 time-estimator 的 AI 调用中）
- 聚类 domain 分配：0 次（合并在 batch-analyze 的 AI 调用中）

## 验收标准
新用户完成 Q2 后，侧边栏"我的世界"立即显示 2-6 个维度骨架。
