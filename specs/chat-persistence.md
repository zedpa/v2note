---
id: "118"
title: "Chat Persistence — 对话持久化 & 上下文压缩"
status: completed
domain: chat
risk: high
dependencies: ["chat-system.md", "auth-core.md"]
superseded_by: null
created: 2026-04-06
updated: 2026-04-06
---

# Chat Persistence — 对话持久化 & 上下文压缩

## 概述

将用户与 AI 的对话从纯内存改为持久存储，实现"微信聊天记录"式的连续对话体验。用户每次进入 ChatView 都能看到完整历史，AI 通过自动压缩在有限上下文窗口内保持连贯。每日将对话总结写入 AI Diary，供记忆系统召回。

**核心原则**：
- 所有 session 基于 `user_id`，不存在游客模式（device_id）
- DB 保留全部原始消息（选项 B），用户可无限回滚
- 压缩摘要仅用于 AI 上下文组装，不影响用户可见的历史
- 长期记忆克制写入：每日一次（diary 总结时），除非用户强调

---

## 1. 数据模型

### 场景 1.1: chat_message 表结构
```
假设 (Given)  系统需要持久化对话消息
当   (When)   创建 chat_message 表
那么 (Then)   包含以下字段：
              - id: UUID PK
              - user_id: UUID NOT NULL REFERENCES app_user(id)
              - role: TEXT NOT NULL ('user' | 'assistant' | 'context-summary')
              - content: TEXT NOT NULL
              - parts: JSONB (工具调用等结构化内容，可选)
              - compressed: BOOLEAN DEFAULT false (标记已被压缩摘要覆盖的消息)
              - created_at: TIMESTAMPTZ DEFAULT now()
并且 (And)    创建索引 idx_chat_msg_user_time(user_id, created_at DESC)
并且 (And)    创建部分索引 idx_chat_msg_uncompressed(user_id, created_at)
              WHERE role != 'context-summary' AND compressed = false
```

### 场景 1.2: 不存储 system prompt
```
假设 (Given)  消息写入 chat_message 表
当   (When)   消息 role 为 system prompt / skill 指令 / soul / memory 上下文
那么 (Then)   不写入 DB
并且 (And)    只存储 role = 'user' | 'assistant' | 'context-summary' 的消息
```

---

## 2. 消息持久化

### 场景 2.1: 用户消息写入
```
假设 (Given)  用户已登录（有 user_id）
当   (When)   用户在 ChatView 中发送一条消息
那么 (Then)   前端通过 WebSocket 发送 chat.message
并且 (And)    gateway 收到后立即写入 chat_message 表（role='user'）
并且 (And)    然后才开始 AI 处理流程
```

### 场景 2.2: AI 回复写入
```
假设 (Given)  gateway 正在流式生成 AI 回复
当   (When)   收到 chat.done 信号（流式完成）
那么 (Then)   将完整回复写入 chat_message 表（role='assistant'）
并且 (And)    parts 字段保存工具调用结构（如有）
```

### 场景 2.3: 首次进入无历史
```
假设 (Given)  用户首次使用 chat 功能（chat_message 表中无该 user_id 的记录）
当   (When)   打开 ChatView
那么 (Then)   显示 AI 的个性化问候消息（由 startChat 生成）
并且 (And)    问候消息也写入 DB（role='assistant'）
```

---

## 3. 历史加载 & 分页 & 本地缓存

### 场景 3.1: 本地缓存层（IndexedDB）
```
假设 (Given)  前端需要快速加载历史消息，避免上翻页卡顿
当   (When)   实现本地缓存
那么 (Then)   使用 IndexedDB 存储 chat_message 的本地副本
并且 (And)    DB name: "v2note-chat-cache"，store: "messages"
并且 (And)    key: message.id，索引: user_id + created_at
并且 (And)    每条消息结构与服务端一致（id, role, content, parts, created_at）
```

### 场景 3.2: 打开 ChatView 加载历史
```
假设 (Given)  用户打开 ChatView
当   (When)   组件 mount
那么 (Then)   优先从 IndexedDB 读取最近 30 条消息（毫秒级）
并且 (And)    立即渲染，用户无感知延迟
并且 (And)    后台同步拉取最近 30 条服务端历史
并且 (And)    服务端数据返回后与本地缓存对比，有新消息则追加并更新缓存
并且 (And)    加载完成后 WebSocket connect 开始新的实时会话
```

### 场景 3.3: 上滑加载更早的消息
```
假设 (Given)  用户在 ChatView 中向上滚动到顶部
当   (When)   触发上滑加载（scrollTop 接近 0）
那么 (Then)   优先从 IndexedDB 查询 created_at < oldest 的 30 条消息
并且 (And)    如果本地有 → 直接 prepend，无网络请求
并且 (And)    本地缓存不足时向服务端拉取更早的 30 条历史消息
并且 (And)    服务端返回的消息写入 IndexedDB 缓存
并且 (And)    保持当前滚动位置不跳动
并且 (And)    如果返回 < 30 条，标记已到达最早消息，不再请求
```

### 场景 3.4: 新消息同步写入缓存
```
假设 (Given)  用户发送消息或收到 AI 回复
当   (When)   消息写入服务端 DB 后
那么 (Then)   同时写入 IndexedDB 本地缓存
并且 (And)    保证下次打开 ChatView 时本地缓存已包含最新消息
```

### 场景 3.5: 日期分隔线
```
假设 (Given)  消息列表包含跨天的消息
当   (When)   相邻两条消息的日期不同
那么 (Then)   在两条消息之间显示日期分隔线
并且 (And)    格式为"YYYY年M月D日 周X"（如"2026年4月6日 周一"）
并且 (And)    今天显示"今天"，昨天显示"昨天"
```

### 场景 3.6: 缓存清理
```
假设 (Given)  IndexedDB 缓存持续增长
当   (When)   缓存消息数量 > 500 条
那么 (Then)   保留最近 500 条，删除更早的本地缓存
并且 (And)    更早的消息仍可通过服务端分页加载（按需拉取并缓存）
```

---

## 4. 上下文压缩

### 场景 4.1: 压缩触发条件
```
假设 (Given)  gateway startChat 或 sendChatMessage 组装 AI 上下文时
当   (When)   未压缩的消息数量 > 40 条或>200000token
那么 (Then)   触发压缩流程
并且 (And)    压缩在后台异步执行，不阻塞当前请求
```

### 场景 4.2: 压缩执行流程
```
假设 (Given)  压缩被触发，当前有 N 条未压缩消息（N > 40）
当   (When)   执行压缩
那么 (Then)   取最早的 (N - 20) 条未压缩消息作为压缩源
并且 (And)    调用 AI 生成一段结构化摘要
并且 (And)    将摘要存为新消息（role='context-summary', compressed=false）
并且 (And)    将压缩源消息标记为 compressed=true
并且 (And)    保留最近 20 条消息不压缩
```

### 场景 4.3: 压缩 prompt 设计
```
假设 (Given)  需要 AI 压缩一批旧消息
当   (When)   构建压缩 prompt
那么 (Then)   使用以下指令：
              "请将以下对话压缩为一段简洁的摘要，供后续对话参考。
               必须保留：
               - 用户表达的偏好和习惯
               - 做出的决策和结论
               - 提到的具体人名、项目名、数字
               - 用户的情感状态变化
               - 未完成的讨论或待跟进事项
               可以省略：寒暄、重复内容、AI 的冗长解释"
并且 (And)    输出为纯文本（非 JSON），便于 AI 理解
并且 (And)    使用fast provider（如qen3-max 关闭思考）降低成本
```

### 场景 4.4: AI 上下文组装
```
假设 (Given)  gateway 需要组装 AI 的消息上下文
当   (When)   该用户有历史 context-summary 和未压缩消息
那么 (Then)   按以下顺序组装：
              1. system prompt（soul + memory + skill，动态生成）
              2. 所有 context-summary 消息按时间正序拼接，注入为一条 system 消息
              3. 最近 20 条未压缩的原始消息（role=user/assistant）
并且 (And)    context-summary 注入格式为：
              "[历史对话摘要]\n{summary1}\n\n{summary2}\n..."
```

### 场景 4.5: 递增压缩
```
假设 (Given)  已经存在一条或多条 context-summary
当   (When)   再次触发压缩
那么 (Then)   只压缩新产生的未压缩消息（不重新压缩旧 summary）
并且 (And)    新的 context-summary 追加到已有 summary 之后
并且 (And)    当 context-summary 总数 > 5 时，将所有 summary 合并为一条
```

---

## 5. 即时记忆触发

### 场景 5.1: 关键词快筛 + AI 判断
```
假设 (Given)  用户在 chat 中发送一条消息
当   (When)   消息命中以下任一模式类别：
              【显式记忆指令】
              "记住"、"记下来"、"记好了"、"别忘了"、"给我记着"
              【持久性规则设定】
              "以后都"、"以后每次"、"从现在起"、"从今以后"
              "永远不要"、"再也不要"、"别再给我"
              "每次都要"、"一直这样"、"所有时候都"
              "必须"、"一定要"、"绝对不能"、"不许"、"不准"
              【纠正 / 不满】
              "说了多少次了"、"跟你说过"、"我不是说了吗"
              "又这样"、"怎么又"、"还是这样"
              "不是这样的"、"我要的不是"、"你怎么每次都"
              【偏好声明】
              "我喜欢"、"我不喜欢"、"我习惯"、"我讨厌"
              "我的风格是"、"我一般都"、"对我来说"
那么 (Then)   立即调用 maybeCreateMemory(userMessage)
并且 (And)    由 Mem0 AI 判断是否真正值得存储（ADD/UPDATE/DELETE/NONE）
并且 (And)    快筛只是门槛过滤，最终存储决策由 AI 做
```

### 场景 5.2: 快筛实现
```
假设 (Given)  需要高效检测用户消息是否命中关键词
当   (When)   实现快筛逻辑
那么 (Then)   使用正则表达式预编译一次，O(1) 匹配
并且 (And)    模式为：/(记住|记下来|记好了|别忘了|以后都|以后每次|从现在起|...)/
并且 (And)    命中后异步调用 maybeCreateMemory，不阻塞回复流程
```

---

## 6. 每日 Diary 写入

### 场景 6.1: 每日对话总结
```
假设 (Given)  daily-loop 晚间总结任务执行
当   (When)   当天存在 chat_message 记录（role = user/assistant）
那么 (Then)   查询当天全部对话消息
并且 (And)    调用 AI 生成日记段落（不含 system prompt）
并且 (And)    写入 ai_diary 表（source = "chat_daily"）
```

### 场景 6.2: 日记中提取长期记忆
```
假设 (Given)  每日对话日记已生成
当   (When)   日记内容写入 ai_diary 后
那么 (Then)   将日记内容交给 Mem0 做一次长期记忆提取
并且 (And)    这是当天唯一的对话记忆提取入口（场景 5.1 的即时触发除外）
```

### 场景 6.3: 无对话日跳过
```
假设 (Given)  daily-loop 执行每日对话总结
当   (When)   当天无 chat_message 记录
那么 (Then)   跳过，不生成空日记
并且 (And)    不触发 Mem0
```

### 场景 6.4: endChat 不再触发记忆
```
假设 (Given)  用户关闭 ChatView 触发 endChat
当   (When)   endChat 执行清理
那么 (Then)   不再调用 appendToDiary（改为每日汇总）
并且 (And)    不再调用 maybeCreateMemory
并且 (And)    仍然保留 soul/profile 更新逻辑
```

---

## 7. Gateway 上下文恢复

### 场景 7.1: startChat 恢复上下文
```
假设 (Given)  用户打开 ChatView 并建立 WebSocket 连接
当   (When)   gateway 收到 chat.start
那么 (Then)   查询该 user_id 的 context-summary 消息（按时间正序）
并且 (And)    查询最近 20 条未压缩消息
并且 (And)    注入到 SessionContext 中
并且 (And)    AI 能感知之前的对话内容，实现连贯对话
```

### 场景 7.2: session 过期后恢复
```
假设 (Given)  用户的 gateway session 已过期（10 分钟 TTL）
当   (When)   用户重新打开 ChatView
那么 (Then)   创建新 session，从 DB 恢复上下文（同场景 7.1）
并且 (And)    用户无感知，对话无缝继续
```

### 场景 7.3: AI 正确区分昨天与今天的记录 <!-- ✅ completed (fix-ai-memory-time) -->
```
假设 (Given)  用户昨天录了"和张总开会"、今天录了"去超市买菜"
当   (When)   用户打开聊天并询问今天做了什么
那么 (Then)   AI 回复中出现"买菜"而不混入"张总开会"
并且 (And)    再询问昨天时，AI 回复出现"张总开会"
```

---

## 接口约定

### HTTP API

```typescript
// GET /api/v1/chat/history — 分页加载历史消息
interface ChatHistoryQuery {
  limit?: number;          // 默认 30，最大 100
  before?: string;         // 游标：返回 created_at < 此消息的记录
}

interface ChatHistoryResponse {
  messages: {
    id: string;
    role: 'user' | 'assistant';  // 不返回 context-summary
    content: string;
    parts?: MessagePart[];
    created_at: string;
  }[];
  has_more: boolean;
}
```

### 本地缓存（IndexedDB）

```typescript
// features/chat/lib/chat-cache.ts
interface ChatCacheMessage {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: MessagePart[];
  created_at: string;
}

interface ChatCache {
  // 读取
  getRecent(userId: string, limit: number): Promise<ChatCacheMessage[]>;
  getBefore(userId: string, beforeTime: string, limit: number): Promise<ChatCacheMessage[]>;

  // 写入
  put(msg: ChatCacheMessage): Promise<void>;
  putBatch(msgs: ChatCacheMessage[]): Promise<void>;

  // 清理
  pruneOld(userId: string, keepCount: number): Promise<void>;
}
```

### DB Repository

```typescript
interface ChatMessageRepo {
  // 写入
  saveMessage(userId: string, role: string, content: string, parts?: any): Promise<string>;

  // 分页读取（用户视角，不含 context-summary，不排除 compressed）
  getHistory(userId: string, limit: number, before?: string): Promise<ChatMessage[]>;

  // AI 上下文读取
  getContextSummaries(userId: string): Promise<ChatMessage[]>;
  getUncompressedMessages(userId: string, limit: number): Promise<ChatMessage[]>;

  // 压缩操作
  markCompressed(messageIds: string[]): Promise<void>;

  // 每日统计
  getMessagesByDate(userId: string, date: string): Promise<ChatMessage[]>;
}
```

---

## 边界条件

- [ ] 用户首次使用（无历史）→ AI 问候写入 DB，正常开始
- [ ] 对话中断（WS 断连）→ 已写入 DB 的消息不丢失，重连后恢复
- [ ] 上滑加载时新消息到达 → 新消息 append 到底部，不影响历史加载
- [ ] 压缩执行中用户继续发消息 → 压缩异步执行，新消息正常处理
- [ ] context-summary 累计过长 → 合并多条 summary 为一条
- [ ] 多设备登录同一账号 → 基于 user_id，所有设备共享同一对话历史
- [ ] 即时记忆关键词误触发 → Mem0 AI 判断兜底，误触不会写入无意义记忆
- [ ] 本地缓存与服务端不一致（其他设备发了消息）→ 后台同步补齐
- [ ] IndexedDB 不可用（隐私模式）→ 降级为纯网络加载，体验略慢但功能完整

---

## 依赖

- `auth-core.md` — user_id 获取
- `chat-system.md` — 现有 chat 架构（startChat/sendChatMessage/endChat）
- Mem0 记忆系统 — maybeCreateMemory
- daily-loop — 每日定时任务

---

## Implementation Phases

- [x] **Phase 1: DB + 持久化** — 建表迁移 + chat-message-repo + 消息读写（场景 1-2）
- [x] **Phase 2: 历史加载 + 本地缓存** — HTTP API + IndexedDB 缓存层 + 前端加载历史 + 日期分隔线 + 上滑分页（场景 3）
- [x] **Phase 3: 上下文恢复** — gateway startChat 从 DB 恢复上下文 + session 过期恢复（场景 7）
- [x] **Phase 4: 压缩** — 触发检测 + 压缩执行 + AI 上下文组装 + 递增压缩（场景 4）
- [x] **Phase 5: 即时记忆** — 关键词快筛 + maybeCreateMemory 异步触发（场景 5）
- [x] **Phase 6: 每日 Diary** — daily-loop 对话总结 + diary 写入 + Mem0 提取 + endChat 瘦身（场景 6）

## 备注

- 压缩方案借鉴 Claude Code /compact：不丢弃原文，仅生成摘要用于 AI 上下文；DB 保留全部原始消息供用户回看
- 压缩使用快速模型（haiku）降低成本
- 快筛关键词列表可在实践中持续扩展，但最终存储决策始终由 Mem0 AI 判断
- 不存在游客模式，所有数据基于 user_id 索引
