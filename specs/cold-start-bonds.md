# 冷启动浅层关联

> 状态：🟡 待开发 | 优先级：Phase 1 | 预计：2-3 天

## 概述
前 10 条日记时 Cluster 还没涌现，但 Bond 从第 2 条日记就能产生。需要把 Strike 级 Bond 聚合为日记级"相关记录"推荐，让用户尽早感受到"这个工具在理解我"。这是用户留存的关键：第 6 条日记就能看到关联。

## 场景

### 场景 1: Digest L1 即时产生跨记录 Bond
```
假设 (Given)  用户已有 5 条种子日记（冷启动产出）
并且 (And)    第 6 条日记被 Digest L1 处理
当   (When)   新 Strike 和历史 Strike 做混合检索
那么 (Then)   至少发现 1 条 bond (strength > 0.5)
并且 (And)    bond 写入数据库
```

**当前状态：** digest.ts 已实现跨记录 bond 检测。本场景为确认 + 冷启动上下文验证。

### 场景 2: 日记级关联度聚合
```
假设 (Given)  日记 A 的 3 个 Strike 和日记 B 的 2 个 Strike 间有 4 条 bond
当   (When)   请求 GET /api/v1/records/:id/related
那么 (Then)   返回日记 B 作为相关记录
并且 (And)    关联度 = Σ(bond.strength) / max(strikeCount_A, strikeCount_B)
并且 (And)    只返回关联度 > 0.4 的日记
并且 (And)    material 来源的 bond 在聚合时 strength × 0.2
并且 (And)    结果按关联度降序，最多返回 10 条
```

### 场景 3: 时间线卡片显示关联计数
```
假设 (Given)  日记 A 有 3 条相关记录
当   (When)   渲染时间线卡片
那么 (Then)   底部显示 "🔗 3" 标记
并且 (And)    点击后焦点侧边栏展示相关记录列表
并且 (And)    每条相关记录显示：摘要 + 日期 + 关联度指示条
```

### 场景 4: 冷启动后第一条手动日记立刻看到关联
```
假设 (Given)  用户完成冷启动 5 问（产出 5 条种子日记 + 10-20 个 Strike）
并且 (And)    用户手动写了第 6 条日记（关于工作的某个话题）
当   (When)   Digest L1 完成
那么 (Then)   该日记底部大概率显示 "🔗 1-2"
并且 (And)    因为冷启动 Q2/Q3 的回答大概率和工作话题语义相关
```

### 场景 5: 无关联时不显示
```
假设 (Given)  日记完全是新话题，和历史无交集
当   (When)   关联查询返回空
那么 (Then)   不显示关联标记（不显示 "🔗 0"）
并且 (And)    不影响卡片渲染
```

## 边界条件
- [ ] 大量日记（>500）时聚合查询性能：应 < 200ms
- [ ] 自己和自己不关联
- [ ] 同一 record 的 Strike 间 bond 不计入跨日记关联

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新建 `gateway/src/cognitive/record-relations.ts` | 日记级 bond 聚合逻辑 |
| 新建 `gateway/src/routes/record-relations.ts` | GET /api/v1/records/:id/related |
| `features/diary/components/diary-card.tsx` 或同等 | 修改：添加关联计数标记 |
| `features/diary/components/focus-sidebar.tsx` 或同等 | 修改：展示相关记录列表 |

## 数据库变更
无（基于已有 strike + bond 表聚合）

## AI 调用
0 次（纯 bond 聚合计算）

## 验收标准
用户第 6 条日记（冷启动 5 问之后的第 1 条手动记录）就能看到关联。点击能展开相关日记列表。
