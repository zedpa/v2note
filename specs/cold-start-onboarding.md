# 冷启动 5 问

> 状态：✅ 已完成 | 优先级：Phase 2
> 2026-03-29 修复：Q2 回答 → seedDimensionGoals 创建种子目标（level=1 todo with domain）

## 概述
升级现有 `onboarding-seed.tsx`（3 个种子问题）为完整的 5 问对话。冷启动同时完成三件事：建立关系（路路人格）、收集种子数据（5 问回答即前 5 条日记进入 Digest）、配置系统（顶层维度、推送时间、功能偏好）。

**当前状态：** `features/cognitive/components/onboarding-seed.tsx` 已有 3 问（"最近在忙什么"/"今年最想实现"/"一直想做的事"），提交到 `/api/v1/records`。

## 场景

### 场景 1: 5 问对话流程
```
假设 (Given)  新用户首次打开 App
并且 (And)    检测到无历史记录（record 表为空）
当   (When)   进入冷启动对话
那么 (Then)   路路主导 5 轮对话：

  Q1（称呼）: "你好！我是路路 🦌 怎么称呼你？"
    → 存入 UserProfile.name
    → 后续所有 AI 输出使用该称呼

  Q2（生活阶段）: "[名字]，你现在主要在做什么？上学、工作、创业、带娃…随便说说。"
    → 提取关键词生成顶层维度候选，可以多选
    → 回答作为第 1 条日记 (source_type='think') 进入 Digest

  Q3（当前焦点）: "最近最让你花心思的一件事是什么？"
    → 创建 intend 类 Strike
    → 如果足够具体，创建第一个 suggested goal
    → 回答作为第 2 条日记进入 Digest

  Q4（痛点）: "你有没有觉得很多想法想过就忘了，或者决定了的事总是拖着没做？"
    → 存入 UserProfile.pain_points
    → 配置功能偏好：
      "总是拖延" → 行动面板优先展示
      "想法太散" → 认知地图优先展示
    → 回答作为第 3 条日记进入 Digest

  Q5（习惯）: "你一般什么时候有空整理想法？早上？睡前？"
    → 配置每日回顾推送时间
    → 回答作为第 4 条日记进入 Digest
```

### 场景 2: 5 问回答作为种子数据
```
假设 (Given)  用户完成 5 问
当   (When)   所有回答提交完成
那么 (Then)   产生 4 条 source_type='think' 的日记（Q2-Q5）
并且 (And)    每条日记立即触发 Digest（冷启动期不走 3h batch）
并且 (And)    预计产出 10-20 个初始 Strike
并且 (And)    为冷启动浅层关联（cold-start-bonds）提供种子
```

### 场景 3: 5 问完成后系统初始化
```
假设 (Given)  5 问和 Digest 都完成
当   (When)   用户进入主界面
那么 (Then)   种子维度已生成（seedDimensionGoals 创建 level=1 带 domain 的 goals）
并且 (And)    写作面板 placeholder 个性化：
      "[名字]，可以开始了。想到什么就说——关于[Q3焦点]、或任何其他东西。"
并且 (And)    如果 Q3 产生了 suggested goal，目标场景已有内容
```

### 场景 4: 跳过机制
```
假设 (Given)  用户不想回答某个问题
当   (When)   点击"跳过"
那么 (Then)   该问题不产生日记
并且 (And)    相关配置使用默认值
并且 (And)    不影响后续问题
并且 (And)    至少完成 Q1 + Q2 才允许进入主界面
```

### 场景 5: 已有用户不再触发
```
假设 (Given)  用户已完成冷启动（UserProfile.onboarding_done=true）
当   (When)   打开 App
那么 (Then)   不触发冷启动对话
并且 (And)    直接进入主界面
```

## 边界条件
- [ ] 用户离开 App 再回来：记住进度，从上次中断的问题继续
- [ ] 极短回答（"上班"2 字）：仍然有效，不强制长度
- [ ] Q1 输入特殊字符：清洗后存储

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `features/cognitive/components/onboarding-seed.tsx` | 重构：3 问 → 5 问对话式 |
| `gateway/src/handlers/process.ts` | 修改：冷启动期每条立即 Digest |
| `gateway/src/db/repositories/user-profile.ts` | 修改：新增 name/pain_points/preferences 字段 |
| `gateway/src/handlers/onboarding.ts` | Q2 回答 → seedDimensionGoals 创建种子目标 |

## 数据库变更
- UserProfile 表确认/新增：name, pain_points, preferences (JSONB), onboarding_done (bool)
- 无新表

## AI 调用
- 种子维度生成：0 次（纯关键词匹配，不调 LLM）
- 种子日记 Digest：4 次标准 L1 调用

## 验收标准
新用户 2 分钟内完成 5 问，立刻看到个性化的写作引导和顶层结构骨架。
