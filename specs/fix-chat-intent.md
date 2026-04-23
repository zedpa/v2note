---
id: fix-chat-intent
title: "Fix: 复合日记意图误判为查询指令"
status: completed
backport: prompt-architecture-v2-layers.md
domain: agent
risk: medium
dependencies: []
created: 2026-04-08
updated: 2026-04-08
---

# Fix: 复合日记意图误判为查询指令

## Bug 现象

用户正常录入复合日记（叙述性内容中包含指令类措辞），AI 将**整条记录**识别为查询指令（`action` + `query_todo`），而非 `record`（附带 todos 提取）。

### 复现示例

输入："今天和张总开会聊了原材料价格，涨了15%，记得后天找他确认报价，另外下周的团建也要开始准备了"

- **期望**：`intent_type: "record"`，summary 保留全文，todos 提取"后天找张总确认报价"和"准备下周团建"
- **实际**：`intent_type: "action"`，commands 包含 `query_todo`，日记内容被当作指令处理

## 根因分析

问题出在 `gateway/src/handlers/unified-process-prompt.ts` 的意图分类规则：

1. **默认倾向不明确**：prompt 中 record/action/mixed 三种类型平等呈现，缺少"绝大多数情况应为 record"的强引导
2. **"指令"定义过宽**：含"记得""需要""确认"等意愿词的叙述被误判为指令
3. **commands 中包含 query_todo**：纯查询操作不应出现在日记处理流程中（查询应走 chat 或 forceCommand 通道）
4. **mixed 类型处理粗糙**：process.ts L348 对 mixed 和 action 一视同仁地执行 commands

## 1. 日记页工具路由简化

### 场景 1.1: 日记页仅开放 create_todo + modify_todo
```
假设 (Given)  用户在日记页录入内容（Layer 3 统一处理）
当   (When)   AI 处理日记文本
那么 (Then)   可用工具仅为 create_todo 和 modify_todo
并且 (And)    不包含 complete_todo / query_todo
并且 (And)    工具调用默认无需用户确认，直接执行
```

### 场景 1.2: 纯叙述性日记正确识别为 record
```
假设 (Given)  用户通过日记入口录入内容
当   (When)   内容为纯叙述/思考/感受，如"今天天气不错，心情很好"
那么 (Then)   intent_type 为 "record"
并且 (And)    commands 为空数组
并且 (And)    todos 为空数组
```

### 场景 1.3: 包含意愿表达的叙述仍为 record + 自动创建待办
```
假设 (Given)  用户录入内容包含意愿词（"记得""需要""打算"）
当   (When)   内容主体是叙述性的（如"今天开会讨论了XXX，记得后天跟进"）
那么 (Then)   intent_type 为 "record"
并且 (And)    意愿部分提取到 todos 数组，自动创建（无需确认）
并且 (And)    commands 为空数组
```

### 场景 1.4: 纯指令走 action + 仅 create/modify
```
假设 (Given)  用户录入的内容完全是操作指令（无叙述）
当   (When)   内容为纯命令句（如"把明天的会议改到后天"）
那么 (Then)   intent_type 为 "action"
并且 (And)    commands 仅包含 create_todo 或 modify_todo
并且 (And)    直接执行，无需确认
```

## 2. 废弃 mixed + 收紧分类

### 场景 2.1: 废弃 mixed 类型
```
假设 (Given)  用户输入同时包含叙述和指令
当   (When)   AI 判断意图类型
那么 (Then)   intent_type 为 "record"（有叙述就是日记）
并且 (And)    指令部分提取到 todos（自动创建）
并且 (And)    仅当内容**完全**是操作指令、无任何叙述时，才为 "action"
```

## 3. 工具可用性按页面可配置（预留）

### 场景 3.1: 不同页面的工具白名单
```
假设 (Given)  系统支持按 sourceContext 配置可用工具
当   (When)   process 收到 sourceContext 参数
那么 (Then)   根据页面上下文过滤可用工具
并且 (And)    默认配置：
               - diary（日记页）: [create_todo, modify_todo]
               - todo（待办页）: [create_todo, complete_todo, modify_todo, query_todo]
               - chat（聊天页）: 全部工具
并且 (And)    配置格式预留为 Record<SourceContext, string[]>，后续由 localConfig 统一管理
```

## 验收行为（E2E 锚点）

> 以下描述纯用户视角的操作路径，不涉及内部实现，用于生成独立的 E2E 测试。

### 行为 1: 复合日记正确保存为日记
1. 用户通过录音/文字输入一段包含"记得后天找张总"的叙述
2. 系统应将全文保存为日记（summary 保留完整叙述）
3. 系统应从中提取待办"后天找张总确认报价"
4. 不应出现 CommandSheet（不应将其当作指令处理）

### 行为 2: 纯指令仍正常工作
1. 用户输入"帮我把买菜这个待办标记完成"
2. 系统应识别为 action
3. 系统应执行 complete_todo 命令

## 边界条件
- [ ] 全部是指令词的短句（"提醒我明天开会"）→ 仍为 record + todo 提取
- [ ] 纯查询（"我明天有什么安排"）→ record 类型，不执行 query（查询走 chat）
- [ ] 多条指令混合叙述 → record + 多个 todos
- [ ] 空输入 → 已有处理

## 修复方案

### 改动 1: `unified-process-prompt.ts` — 修正意图分类 + 工具白名单
- 强调 record 是**默认**类型，只有完全是操作指令时才为 action
- 废弃 mixed 类型 → 统一归为 record
- commands 仅保留 create_todo / modify_todo（日记页场景）
- 增加判断示例，明确区分"叙述中的意愿"vs"直接指令"

### 改动 2: `process.ts` — 收窄执行 + 去确认 + 预留配置接口
- 仅 `intent_type === "action"` 时才执行 commands
- 移除对 mixed 的 commands 执行逻辑
- commands 执行默认无需确认（不走 CommandSheet 确认流程）
- 预留 `toolWhitelist: Record<SourceContext, string[]>` 配置接口

### 改动 3: 预留工具配置接口
- 在 process.ts 或独立 config 中定义默认工具白名单
- 格式：`{ diary: ["create_todo", "modify_todo"], todo: ["create_todo", "complete_todo", "modify_todo", "query_todo"], chat: "*" }`
- 后续由 localConfig 覆盖

## 依赖
- gateway/src/handlers/unified-process-prompt.ts
- gateway/src/handlers/process.ts

## Implementation Phases
- [ ] Phase 1: 修改 unified-process-prompt.ts — 废弃 mixed、收窄 commands 类型
- [ ] Phase 2: 修改 process.ts — 仅 action 执行 commands、去确认、预留工具白名单
- [ ] Phase 3: 单元测试验证

## 备注
- query_todo / complete_todo 在日记页不合理：查询走 chat，完成走待办页
- 废弃 mixed 简化了逻辑：有叙述就是日记，指令部分提取为 todos 即可
- 工具白名单预留为 config 接口，当前硬编码默认值，后续用户可通过 localConfig 覆盖
