---
id: "decision-template"
status: completed
domain: cognitive
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# 决策模板涌现

> 状态：✅ completed | 优先级：Phase 6 | 预计：2-3 天
> 依赖：goal-auto-link, action-tracking

## 概述
当一个完整的决策闭环完成（目标 suggested → active → 有行动 → 完成 → 有结果反馈），系统提议保存为可复用模板。下次类似决策时，路路可引用模板框架。

## 场景

### 场景 1: 检测完整决策闭环
```
假设 (Given)  goal "评估供应商" 经历了完整生命周期：
      suggested → active → 3 个 todo 已完成 → goal archived
并且 (And)    有结果反馈（用户日记提到了结果）
当   (When)   系统检测到闭环
那么 (Then)   晚间回顾提议："'供应商评估'完整完成了！要保存这个流程作为模板吗？"
```

### 场景 2: 模板辅助新决策
```
假设 (Given)  存在"供应商评估"模板
并且 (And)    用户提到需要做新的供应商评估
当   (When)   参谋对话识别到语义匹配
那么 (Then)   路路提示："上次你评估供应商的流程是这样的……要参考吗？"
并且 (And)    提供模板中的步骤框架
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新建 `gateway/src/cognitive/decision-template.ts` | 闭环检测 + 模板存储 |
| `gateway/src/handlers/chat.ts` | 修改：模板匹配注入 |

## 验收标准
完成一个目标后被提议保存模板；下次类似场景路路主动引用。
