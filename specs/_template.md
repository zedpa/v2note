<!--
🤖 AI 指令（创建/修改 Spec 前必读）：

1. 先读取 specs/INDEX.md，按 domain 查找是否已有 active 或 draft 状态的 spec
2. 如果已有同 domain 的 spec → 在已有文件中追加功能模块或场景，不要新建文件
3. 只有当功能属于全新 domain、且与现有 spec 无法归并时，才创建新 spec
4. 创建新 spec 后必须同步更新 INDEX.md
5. 如果单一域 spec 超过约 500 行，应主动拆分为子域（如 todo-core.md + todo-ui.md）——
   这不是死规则，内容紧密耦合时可保持原样，但超长文件会削弱大模型注意力。
   拆分后必须在 INDEX.md 中标注子域关系，原文件标记为 superseded
6. 禁止凭空猜测现有领域划分，必须用工具读取 INDEX.md 确认
-->

---
id: "NNN"
title: ""
status: draft            # draft | active | completed | superseded | deprecated
domain: ""               # todo | chat | auth | cognitive | agent | ui | infra | voice | onboarding | report | design | goal
dependencies: []         # 例如 ["003-auth.md", "012-voice-routing.md"]
superseded_by: null       # 被哪个 spec 替代，例如 "020-todo-system.md"
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# [功能名称]

## 概述
[一句话描述这个功能做什么，为谁解决什么问题]

## 1. [功能模块 A]

### 场景 1.1: [场景名称]
```
假设 (Given)  [前置条件]
当   (When)   [用户操作或系统事件]
那么 (Then)   [期望结果]
并且 (And)    [额外的期望结果]
```

### 场景 1.2: [场景名称]
```
假设 (Given)  [前置条件]
当   (When)   [用户操作或系统事件]
那么 (Then)   [期望结果]
```

## 2. [功能模块 B]

### 场景 2.1: 异常处理
```
假设 (Given)  [异常前置条件]
当   (When)   [触发操作]
那么 (Then)   [系统应如何优雅处理]
并且 (And)    [不应发生什么]
```

## 边界条件
- [ ] 空输入
- [ ] 超长输入
- [ ] 并发操作
- [ ] 网络中断
- [ ] [其他相关边界]

## 接口约定（可选）

输入：
```typescript
interface Input {
  // 描述输入数据结构
}
```

输出：
```typescript
interface Output {
  // 描述输出数据结构
}
```

## 依赖
- [列出此功能依赖的其他模块或外部服务]

## Implementation Phases (实施阶段)
- [ ] Phase 1: [描述]
- [ ] Phase 2: [描述]

## 备注
- [任何补充说明、设计决策、已知限制]
