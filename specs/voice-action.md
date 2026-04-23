---
id: "101"
title: "语音指令自动识别与执行"
status: completed
domain: voice
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 语音指令自动识别与执行

> 状态：✅ 已完成 | 优先级：Phase 4.5（语音行动闭环）| 完成日期：2026-03-26
> 依赖：smart-todo（待办工具层）, agent-tool-layer（工具注册 + function calling）

## 概述

用户说的每句话，当前系统必须由用户选择"录日记"还是"发指令"（长按上滑 = 指令模式）。隐藏手势用户记不住。本 spec 消除这个区分：**所有语音统一入口，AI 在 Process 阶段自动判断是"记录"还是"指令"还是"混合"**，指令型直接走 Agent 工具链执行。

**核心改变：** 用户不再需要切换模式。说话就够了，AI 自己判断怎么处理。

## 意图分类体系

```
语音输入
  ↓
意图分类器（process-prompt 增强）
  ↓
┌─────────────┬──────────────┬──────────────┐
│ 记录型       │ 指令型        │ 混合型        │
│ record       │ action       │ mixed        │
│              │              │              │
│ "今天开会    │ "把张总那个   │ "开会说了涨价 │
│  很无聊"     │  改到明天3点" │  提醒我明天问 │
│              │              │  张总报价"    │
│  ↓           │  ↓           │  ↓           │
│ 正常Digest   │ Agent执行    │ Digest记录   │
│              │  ↓           │ +Agent执行   │
│              │ 返回结果     │              │
└─────────────┴──────────────┴──────────────┘
```

### 指令意图类型

```typescript
type ActionIntent =
  | "modify_todo"      // "把XX改到明天" "给XX加个备注"
  | "complete_todo"    // "张总电话打了" "报告写完了"
  | "query_todo"       // "我今天还有什么没做" "明天有什么安排"
  | "delete_todo"      // "取消明天的会" "那个不用做了"
  | "create_todo"      // "提醒我明天打电话" （指令语气，非日记型）
  | "modify_goal"      // "把产品架构进度改到80%"
  | "query_record"     // "最近供应链相关的有哪些"
  | "general_command"  // "打开设置" "搜索XX" "帮我查查铝价"
```

## 场景

### 场景 1: 纯指令 — 修改待办
```
假设 (Given)  用户有一条待办"打给张总确认铝材报价"，scheduled 今天 10:00
当   (When)   用户点击 FAB 录音，说"把打给张总那个改到明天下午三点，顺便加个备注问他最新报价"
那么 (Then)   ASR 转写完成后，Process 识别为 action 类型
并且 (And)    提取: type=modify_todo, target_hint="打给张总", changes={scheduled_start: 明天15:00, append_note: "问最新报价"}
并且 (And)    模糊匹配待办: GET /todos → 关键词"张总"匹配到目标待办
并且 (And)    执行: PATCH /todos/:id {scheduled_start, text 追加备注}
并且 (And)    WS 推送 action.result: {success: true, summary: "已将'打给张总'改到明天下午3点，加了备注"}
并且 (And)    前端 AI 气泡显示执行结果（✅ 样式）
并且 (And)    不创建日记记录（纯指令不产生 record）
```

### 场景 2: 纯指令 — 完成待办
```
假设 (Given)  用户有一条待办"打给张总确认铝材报价"
当   (When)   用户录音说"张总的电话打了，报价没变"
那么 (Then)   Process 识别为 mixed 类型: action(complete_todo) + record(日记)
并且 (And)    执行: PATCH /todos/:id {done: true}
并且 (And)    同时创建日记记录: "张总的电话打了，报价没变"
并且 (And)    AI 气泡: "✅ 已完成'打给张总'，这条也记下来了"
```

### 场景 3: 纯指令 — 查询待办
```
假设 (Given)  用户有多条待办
当   (When)   用户录音说"我明天有什么安排"
那么 (Then)   Process 识别为 action 类型: query_todo
并且 (And)    查询: GET /todos filtered by scheduled 明天
并且 (And)    WS 推送 action.result: {type: "query", items: [...]}
并且 (And)    AI 气泡展示摘要: "明天有 3 件事：1. 联系新供应商 2. 产品评审会 3. ..."
并且 (And)    气泡可点击展开完整列表 / 跳转待办视图
并且 (And)    不创建日记记录
```

### 场景 4: 混合 — 日记 + 创建待办（指令语气）
```
假设 (Given)  用户在工作区
当   (When)   用户录音说"今天和老王讨论了新方案，提醒我周五前把方案文档发给他"
那么 (Then)   Process 识别为 mixed 类型
并且 (And)    记录部分: 创建日记 "今天和老王讨论了新方案"，走正常 Digest
并且 (And)    指令部分: create_todo {text: "把方案文档发给老王", scheduled_end: 周五}
并且 (And)    AI 气泡: "记下来了。另外帮你创建了待办'把方案文档发给老王'，截止周五。"
```

### 场景 5: 纯指令 — 删除待办（需确认）
```
假设 (Given)  用户有一条待办"周五评审会"
当   (When)   用户录音说"取消周五的评审会"
那么 (Then)   Process 识别为 action 类型: delete_todo，标记为高风险
并且 (And)    AI 气泡: "确认取消'周五评审会'吗？" + [确认] [算了] 按钮
当   (When)   用户点击 [确认] 或再次录音说"确认"
那么 (Then)   DELETE /todos/:id
并且 (And)    AI 气泡更新: "✅ 已取消'周五评审会'"
当   (When)   用户点击 [算了]
那么 (Then)   不执行，气泡消失
```

### 场景 6: 纯指令 — 批量操作（需确认）
```
假设 (Given)  用户有 8 条本周待办
当   (When)   用户录音说"把这周所有待办都推迟到下周"
那么 (Then)   Process 识别为 action 类型: modify_todo (批量)，标记为高风险
并且 (And)    AI 气泡: "你有 8 个本周待办，确认全部推迟到下周一？" + [确认] [看看再说]
当   (When)   用户点击 [看看再说]
那么 (Then)   跳转待办视图，显示本周待办列表供用户手动选择
```

### 场景 7: 纯记录 — 不触发指令
```
假设 (Given)  用户在工作区
当   (When)   用户录音说"今天和张总开会，他说原材料涨了15%"
那么 (Then)   Process 识别为 record 类型（无指令意图）
并且 (And)    正常创建日记 → Digest → Strike 提取
并且 (And)    不触发任何 Agent 操作
```

### 场景 8: 模糊匹配失败
```
假设 (Given)  用户没有与"李总"相关的待办
当   (When)   用户录音说"把李总那个改到明天"
那么 (Then)   Process 识别为 action 类型: modify_todo
并且 (And)    模糊匹配待办: 未找到匹配项
并且 (And)    AI 气泡: "没找到和'李总'相关的待办，你要新建一个吗？" + [新建] [算了]
```

### 场景 9: 指令置信度低时降级
```
假设 (Given)  用户录音内容意图模糊
当   (When)   Process 分类置信度 < 0.7
那么 (Then)   不自动执行指令
并且 (And)    降级为记录型，正常 Digest
并且 (And)    如果 Digest 产出 intend Strike，通过 todo-projector 正常创建待办
```

### 场景 10: 语音查询目标
```
假设 (Given)  用户有目标"Q2 供应链重建"
当   (When)   用户录音说"供应链那个目标进展怎么样了"
那么 (Then)   Process 识别为 action 类型: query_goal
并且 (And)    匹配目标后加载该目标的健康度
并且 (And)    AI 气泡: "供应链重建：进度 60%，方向90%/资源60%/路径40%/驱动80%。待办还剩2个。"
并且 (And)    可点击跳转目标详情页
```

## 接口约定

### Process Prompt 输出扩展

```typescript
interface ProcessResult {
  // 现有
  summary: string;
  intents: IntentSignal[];
  tags: string[];
  relays: RelayItem[];

  // 新增
  actions: VoiceAction[];
}

interface VoiceAction {
  type: ActionIntent;
  confidence: number;          // 0-1，< 0.7 降级为记录
  target_hint: string;         // 模糊匹配关键词
  changes?: Record<string, any>; // modify 时的变更内容
  query_params?: Record<string, any>; // query 时的过滤条件
  risk_level: "low" | "high";  // 删除/批量 = high，其余 = low
  original_text: string;       // 原始指令文本段
}
```

### WebSocket 新消息类型

```typescript
// Server → Client
| { type: "action.result"; payload: {
    action: ActionIntent;
    success: boolean;
    summary: string;         // 中文一句话结果
    todo_id?: string;        // 操作的待办 ID
    goal_id?: string;        // 操作的目标 ID
    items?: any[];           // query 结果列表
    changes?: Record<string, any>;
  }}
| { type: "action.confirm"; payload: {
    action: ActionIntent;
    summary: string;         // "确认取消'周五评审会'吗？"
    confirm_id: string;      // 确认 ID（用于回复）
    risk_level: "high";
  }}

// Client → Server
| { type: "action.confirm_reply"; payload: {
    confirm_id: string;
    confirmed: boolean;
  }}
```

### 模糊匹配策略

```typescript
async function matchTodo(hint: string, userId: string): Promise<Todo[]> {
  // 1. 关键词精确匹配（text ILIKE '%hint%'）
  // 2. 如果无结果，分词后逐词匹配
  // 3. 如果仍无结果，embedding 相似度（阈值 > 0.7）
  // 4. 返回 top-3 候选，confidence 排序
  // 5. 如果最高 confidence < 0.6，返回空（触发场景 8）
}
```

## 确认机制

| 操作 | 风险级别 | 行为 |
|------|---------|------|
| modify_todo (单条) | low | 直接执行，气泡显示结果 |
| complete_todo | low | 直接执行 |
| create_todo | low | 直接执行 |
| query_todo / query_record | low | 直接执行 |
| delete_todo | high | 气泡确认 → 等用户回复 |
| modify_todo (批量) | high | 气泡确认 + 显示受影响数量 |
| modify_goal | low | 直接执行 |
| general_command | low | 路由到对应功能 |

## 边界条件

- [ ] ASR 转写错误导致意图误判：confidence < 0.7 降级为记录型
- [ ] 同一句话包含多个指令："把张总改明天，李总改后天" → 拆为两个 action 依次执行
- [ ] 网络中断时语音指令：缓存到本地，恢复后重试（最多 1 次）
- [ ] 待办已完成时说"完成"：提示"这条已经完成过了"
- [ ] 指令冲突："把张总改到明天" 但多条待办匹配 → 气泡列出候选让用户选

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `gateway/src/handlers/process-prompt.ts` | 修改：增加 action 意图分类指令 |
| `gateway/src/handlers/process.ts` | 修改：增加 action 执行分支 |
| `gateway/src/handlers/voice-action.ts` | 新建：语音指令执行器 |
| `gateway/src/handlers/voice-action-matcher.ts` | 新建：模糊匹配待办/目标 |
| `features/ai-bubble/hooks/use-ai-window.ts` | 修改：处理 action.result/confirm 消息 |
| `features/ai-bubble/components/ai-window.tsx` | 修改：渲染执行结果 + 确认按钮 |
| `shared/lib/gateway-client.ts` | 修改：新增 action.confirm_reply 发送 |

## AI 调用

- 意图分类：复用 process-prompt AI 调用（+0 次，在同一次调用中扩展输出）
- 模糊匹配：0 次（关键词 + embedding 纯计算）
- 指令执行：0 次（直接 CRUD）

## 验收标准

用户点击 FAB 说"把张总那个改到明天下午三点"，3 秒内看到 AI 气泡确认修改结果，待办视图中该待办时间已更新。全程不需要切换模式、不需要手动选择"指令"入口。
