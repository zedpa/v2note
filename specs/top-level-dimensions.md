# 顶层维度——预设骨架 + 涌现填充

> 状态：✅ 已通过统一模型实现 | 优先级：Phase 3
> 场景1: onboarding seedDimensionGoals 种子化 todo.domain goals (2026-03-29)
> 场景2: batch-analyze prompt 已传入 dimensions 列表，AI 自动为 cluster 分配 domain
> 注: top-level.ts 为旧方案（strike level=3），实际维度改为 todo.domain 管理

## 概述
纯涌现导致冷启动期地图空白。方案：冷启动 5 问后用 embedding 相似度（不调 LLM）生成个性化顶层维度（L3 预设 Cluster），后续由涌现逐步填充和调整。

## 场景

### 场景 1: 冷启动完成后生成顶层维度
```
假设 (Given)  用户完成冷启动 Q2 回答："我在铸造厂上班，业余做自己的产品，偶尔炒炒币"
当   (When)   系统分析回答（embedding 匹配预设维度库 + 关键词提取）
那么 (Then)   生成 3-5 个个性化顶层维度：如"工作""个人项目""投资""生活"
并且 (And)    创建对应 L3 级 Cluster（level=3, is_cluster=true, source='preset'）
并且 (And)    思维导图立刻有第一层骨架
```

### 场景 2: 新日记自动归入顶层维度
```
假设 (Given)  用户录入一条关于供应链的日记
当   (When)   Digest L1 完成 Strike 拆解
那么 (Then)   Strike embedding 和顶层维度 Cluster embedding 做余弦相似度匹配
并且 (And)    最高相似度 > 0.6 时自动关联到该顶层维度
并且 (And)    时间线左栏显示：工作 > （该日记）
```

### 场景 3: 涌现结构替代预设
```
假设 (Given)  用户使用 2 个月，L1/L2 丰富涌现
当   (When)   某个 L2 Cluster 与预设顶层维度语义偏离（如"产品开发"独立于"工作"）
那么 (Then)   晚间回顾提议："'产品开发'已经成为独立方向了，要单独作为大类吗？"
并且 (And)    用户确认后，升级为新顶层维度（source='emerged'）
并且 (And)    相关 L1/L2 迁移到新顶层下
```

### 场景 4: 用户手动调整顶层
```
假设 (Given)  用户觉得"投资"不需要独立顶层
当   (When)   用户在思维导图中删除或合并该顶层
那么 (Then)   其下 L1/L2 归入用户指定的其他顶层
并且 (And)    系统记住偏好（source='user_deleted'），后续涌现不再重建
```

### 场景 5: 冷启动期结构展示
```
假设 (Given)  用户只有 5 条日记，L1 尚未涌现
当   (When)   打开思维导图
那么 (Then)   显示顶层维度骨架，每个维度下直接挂日记
并且 (And)    随日记增多，L1 开始涌现，自动插入到顶层和日记之间
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新建 `gateway/src/cognitive/top-level.ts` | 顶层维度生成 + 匹配 + 迁移逻辑 |
| `gateway/src/cognitive/digest.ts` | 修改：L1 后加顶层归属（embedding 匹配） |
| `gateway/src/cognitive/emergence.ts` | 修改：L2 涌现时检查是否需要新顶层 |
| migration | Strike 表加 source 字段 ('preset'|'emerged'|'user') |

## AI 调用
- 顶层生成：0 次（embedding 匹配预设维度库）
- 每条日记归属：0 次（余弦相似度计算）
- 涌现提议：1 次/月（AI 评估是否需要新顶层）

## 验收标准
第一天打开思维导图就有框架；两个月后框架自动演化且用户调整被尊重。
