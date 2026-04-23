---
id: "057"
title: "参谋上下文合并"
status: completed
domain: chat
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 参谋上下文合并

> 状态：✅ completed | 优先级：Phase 5 | 预计：3-4 天
> 依赖：cognitive-report, goal-auto-link

## 概述
参谋对话（chat.ts）已有 skill/soul/memory 注入，但缺少认知引擎数据。用户问"我最近在想什么"，路路应该能引用 Cluster/Strike/Bond 数据回答，而不是泛泛而谈。

**当前状态：**
- chat.ts：加载 skills, soul, memory, pending intents, cognitive alerts
- decision.ts：gatherDecisionContext 已实现深度图遍历
- 但普通 chat 模式不读取 Cluster/Strike 数据

## 场景

### 场景 1: 目标详情"深入讨论"注入完整上下文
```
假设 (Given)  用户在目标详情点击"深入讨论"
当   (When)   构建 decision prompt（chat mode='decision'）
那么 (Then)   system prompt 包含：
      - Memory/Profile：用户身份、偏好、称呼
      - 认知引擎：该目标 Strike/Bond 链路、矛盾 alert
      - 目标状态：健康度四要素、行动完成率
      - 人物：涉及人物在日记中的出现模式
并且 (And)    引用带 [record:ID] 可溯源
并且 (And)    路路人格：温暖、不催促、不评判
```

### 场景 2: 普通 chat 调用认知数据
```
假设 (Given)  用户在普通对话中问"我最近在想什么"
当   (When)   chat.ts 检测到认知相关提问（关键词：最近/在想/关注/焦点）
那么 (Then)   自动注入 top-3 活跃 Cluster（按近 7 天 Strike 数排序）
并且 (And)    注入最近矛盾 alert（如有）
并且 (And)    路路的回答引用具体日记内容
```

### 场景 3: 每日回顾中"展开讨论"
```
假设 (Given)  用户在每日回顾看到洞察"你在供应链上有矛盾观点"
当   (When)   点击"展开讨论"
那么 (Then)   打开参谋对话，上下文包含：
      - 该矛盾的双方 Strike（nucleus + rawText）
      - 相关 Cluster 的其他成员 Strike
      - 时间线（两个观点分别是什么时候说的）
```

### 场景 4: 引用区分原声和素材
```
假设 (Given)  参谋引用了用户日记和 PDF 内容
当   (When)   渲染引用
那么 (Then)   日记引用：📝 "你说过……" + 日期
并且 (And)    素材引用：📄 "报告中提到……" + 来源
并且 (And)    引用可点击跳转原始记录
```

### 场景 5: 对话保存为日记
```
假设 (Given)  参谋完成有价值的分析
当   (When)   对话结束或用户点击"保存"
那么 (Then)   对话摘要保存为新 record (source_type='think', type='conversation')
并且 (And)    进入 Digest 管道
并且 (And)    产出的 Strike 参与后续涌现
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `gateway/src/handlers/chat.ts` | 修改：普通模式加认知数据注入 |
| `gateway/src/cognitive/decision.ts` | 修改：扩展上下文收集范围 |
| `gateway/src/prompt-builder.ts` 或同等 | 修改：引用格式化 |
| `features/chat/components/chat-bubble.tsx` | 修改：引用渲染 + 点击跳转 |

## AI 调用
- 每次对话：1 次（标准 chat 调用，只是 prompt 更丰富）

## 验收标准
参谋对话能引用用户三周前的日记内容，且准确区分原声/素材来源。
