---
id: "093"
title: "人物画像系统"
status: active
domain: cognitive
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 人物画像系统

> 状态：✅ completed | 优先级：Phase 6 | 预计：4 天
> 注意：当前人名提取用正则 extractChineseNames，精度有限。建议 Phase 1 时在 Digest prompt 中加入 NER 能力。

## 概述
用户日记中频繁提到的人物（"张总"/"老王"/"小李"）应该有画像——出现频率、相关话题、行为模式。参谋对话中"怎么说服老王"就能引用画像。

## 场景

### 场景 1: 高频人物自动识别
```
假设 (Given)  "张总" 在 20+ 条日记中出现
当   (When)   周涌现引擎运行人物扫描
那么 (Then)   创建 person 记录：name="张总"
并且 (And)    关联所有提到张总的 Strike
并且 (And)    统计：出现 N 次、主要话题 top-3 Cluster、最近互动日期
```

### 场景 2: 行为模式提取
```
假设 (Given)  "老王" 关联 8 条日记
当   (When)   AI 分析老王相关的所有 Strike
那么 (Then)   提取模式："老王在涉及风险的讨论中倾向保守"
并且 (And)    存入 person.patterns
并且 (And)    模式以确认形式呈现用户（"这准确吗？"）
```

### 场景 3: 参谋调用人物画像
```
假设 (Given)  用户问"怎么说服老王支持换供应商"
当   (When)   参谋构建回复
那么 (Then)   注入老王行为模式 + 历史观点 Strike
并且 (And)    路路回复基于画像给出策略建议
```

### 场景 4: 人物在行动面板的上下文
```
假设 (Given)  待办"找老王确认报价"出现在 Now Card
当   (When)   渲染行动上下文
那么 (Then)   显示：上次和老王相关的日记日期 + 主要话题
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新 migration | person 表 (id, user_id, name, aliases, patterns, stats) |
| 新建 `gateway/src/cognitive/person-profile.ts` | 人物扫描 + 模式提取 |
| `gateway/src/cognitive/daily-cycle.ts` | 修改：加人物扫描步骤 |
| `gateway/src/handlers/chat.ts` | 修改：注入人物画像 |

## 验收标准
参谋对话中"老王"有画像可引用；行动面板显示关联人物上下文。
