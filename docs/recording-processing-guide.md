# v2note 录音处理系统 — 使用说明与测试手册

## 目录

1. [系统架构概述](#1-系统架构概述)
2. [环境配置](#2-环境配置)
3. [启动与部署](#3-启动与部署)
4. [功能使用说明](#4-功能使用说明)
5. [WebSocket 消息协议](#5-websocket-消息协议)
6. [REST API 接口](#6-rest-api-接口)
7. [AI 处理流程详解](#7-ai-处理流程详解)
8. [测试检查点](#8-测试检查点)
9. [常见问题排查](#9-常见问题排查)

---

## 1. 系统架构概述

```
┌─────────────────────────────────────────────────────┐
│                    前端 (Next.js)                     │
│                                                       │
│  InputBar ─── usePCMRecorder ─── GatewayClient        │
│  (语音/文字)   (16kHz PCM)       (WebSocket 单例)     │
│     │                               │  ↑               │
│     └──── events.ts ────────────────┘  │               │
│           (pub/sub 事件总线)            │               │
└────────────────────────────────────────│───────────────┘
                                         │ ws:// + binary
┌────────────────────────────────────────│───────────────┐
│                Dialog Gateway (Node.js)│               │
│                                        ↓               │
│  index.ts ─── WebSocket Server                         │
│     │                                                  │
│     ├── ASR Handler ──→ DashScope Realtime ASR         │
│     │   (paraformer-realtime-v2, PCM→文字)             │
│     │                                                  │
│     ├── Process Handler ──→ DashScope qwen-plus        │
│     │   (文字→JSON: todos/tags/requests)               │
│     │                                                  │
│     ├── Chat Handler ──→ DashScope qwen-plus (stream)  │
│     │   (对话式复盘)                                    │
│     │                                                  │
│     └── REST Router ──→ /api/v1/*                      │
│         (records, todos, tags, skills, ...)             │
│                                                        │
│  Skills System: gateway/skills/*.md                    │
│  Memory + Soul: 长期记忆 + 用户画像                      │
│                           │                            │
└───────────────────────────│────────────────────────────┘
                            │ PostgreSQL
┌───────────────────────────│────────────────────────────┐
│              Supabase (PostgreSQL)                      │
│  record, transcript, summary, todo, tag, record_tag,   │
│  idea, memory, soul, skill_config, customer_request,   │
│  setting_change, device, weekly_review                 │
└────────────────────────────────────────────────────────┘
```

### 数据流总览

| 路径 | 说明 |
|------|------|
| 语音 → ASR → 文字 → AI 提取 → DB | 主流程：录音→识别→智能提取 |
| 文字输入 → AI 提取 → DB | 手动笔记走 REST，可选 AI 处理 |
| /review → Chat → Stream | 对话复盘，流式返回 |

---

## 2. 环境配置

### 2.1 Gateway 环境变量 (`gateway/.env`)

| 变量 | 说明 | 必填 | 示例 |
|------|------|------|------|
| `RDS_HOST` | Supabase PostgreSQL 地址 | 是 | `aws-1-ap-northeast-1.pooler.supabase.com` |
| `RDS_DATABASE` | 数据库名 | 是 | `postgres` |
| `RDS_USER` | 数据库用户 | 是 | `postgres.xxx` |
| `RDS_PASSWORD` | 数据库密码 | 是 | — |
| `RDS_PORT` | 数据库端口 | 否 | `6543` (Transaction Pooler) |
| `RDS_SSL` | 是否启用 SSL | 否 | `true` |
| `DASHSCOPE_API_KEY` | 阿里云 DashScope API Key | 是 | `sk-xxx` |
| `AI_BASE_URL` | AI API 基地址 | 否 | 默认 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `AI_MODEL` | AI 模型名 | 否 | 默认 `qwen-plus` |
| `AI_TIMEOUT` | AI 请求超时(ms) | 否 | 默认 `60000` |
| `GATEWAY_PORT` | Gateway 端口 | 否 | 默认 `3001` |

### 2.2 前端环境变量 (`.env.local`)

| 变量 | 说明 | 示例 |
|------|------|------|
| `NEXT_PUBLIC_GATEWAY_URL` | Gateway WebSocket 地址 | `ws://192.168.0.106:3001` |

> **注意**：前端的 REST API 基地址由 WebSocket URL 自动推导（`ws://` → `http://`）。

### 2.3 数据库迁移

确保执行了全部迁移文件，特别是 `006_agent.sql`：

```sql
-- 需要的表：memory, soul, skill_config, customer_request, setting_change
-- 以及 record 表的 source 列
```

如果这些表不存在，AI 处理会降级运行（跳过查询），但仍然可以工作。

---

## 3. 启动与部署

### 3.1 启动 Gateway

```bash
cd gateway
pnpm install
pnpm dev        # 开发模式 (tsx watch，自动重启)
```

启动后应看到：

```
[ai] Provider ready: model=qwen-plus, base=https://dashscope.aliyuncs.com/compatible-mode/v1
[gateway] v2note Dialog Gateway running on port 3001
[gateway] WebSocket: ws://localhost:3001
[gateway] REST API: http://localhost:3001/api/v1/
[gateway] Health: http://localhost:3001/health
```

如果看到 `[ai] WARNING: DASHSCOPE_API_KEY is not set` 则说明 API Key 未配置。

### 3.2 启动前端

```bash
pnpm dev        # Next.js 开发模式
```

### 3.3 健康检查

```bash
curl http://localhost:3001/health
# 应返回: {"status":"ok","timestamp":"2026-02-19T..."}
```

---

## 4. 功能使用说明

### 4.1 语音录音 (InputBar)

**操作方式：**

| 操作 | 说明 |
|------|------|
| 长按麦克风按钮 (≥300ms) | 开始录音，实时显示识别文字 |
| 松开 | 结束录音，发送并触发 AI 处理 |
| 上滑 ≥80px | 锁定录音模式（无需持续按住） |
| 左滑 ≥100px | 取消当前录音 |
| 锁定模式下点"完成" | 结束并发送 |
| 锁定模式下点"取消" | 丢弃录音 |

**录音过程中的界面反馈：**

- 波形动画：16 柱实时跳动
- 实时转录：已确认文字（黑色）+ 正在识别文字（灰色）
- 计时器：显示已录制时长

**完整流程：**

```
按住按钮 → 开始 PCM 采集 (16kHz)
        → 发送 asr.start 到 Gateway
        → PCM 二进制帧实时发送到 Gateway
        → Gateway 转发到 DashScope ASR
        → 收到 asr.partial (局部识别) → 显示灰色文字
        → 收到 asr.sentence (确认句子) → 显示黑色文字
松开按钮 → 发送 asr.stop
        → Gateway 发回 asr.done (完整文本 + recordId)
        → 调用 uploadAudio() 创建 record 记录
        → 调用 processRecording() 触发 AI 提取
        → Gateway 返回 process.result
        → 显示 Toast "AI 处理完成！"
```

### 4.2 文字输入

**操作方式：**

1. 点击输入栏右侧的切换按钮，切换到文字模式
2. 输入文字内容
3. 按 Enter 发送（Shift+Enter 换行）

**斜杠命令：**

| 命令 | 说明 |
|------|------|
| `/review 日期范围` | 启动 AI 复盘对话，如 `/review 上周` |
| `/todo` | 聚合所有待办事项 |
| `/tag add 标签名` | 给当前记录添加标签 |
| `/tag remove 标签名` | 移除标签 |
| `/theme dark/light/system` | 切换主题 |
| `/export json/csv` | 导出数据 |
| `/skill 名称 on/off` | 启用/禁用技能 |
| `/help` | 显示帮助 |

输入 `/` 时会弹出命令自动补全菜单。

### 4.3 AI 复盘对话 (ChatView)

**启动方式：**
- 在 InputBar 输入 `/review 2月1日-2月14日`
- 或从侧边栏点击"复盘"

**交互流程：**

1. 系统自动加载指定日期范围的记录和记忆
2. AI 生成复盘开场白（流式显示）
3. 用户可以自由提问、追问
4. 点击右上角关闭退出复盘

### 4.4 技能系统 (Skills)

技能定义在 `gateway/skills/` 目录下，每个技能一个子目录 + `SKILL.md` 文件。

**内置技能：**

| 技能名 | 说明 | 提取字段 | 默认启用 |
|--------|------|----------|----------|
| `todo-extract` | 提取待办事项 | `todos` | 始终启用 |
| `customer-request` | 提取客户需求 | `customer_requests` | 是 |
| `setting-change` | 提取设置修改意图 | `setting_changes` | 是 |
| `meta-question` | 深层问题分析 | — | 否（仅 chat 模式） |

**SKILL.md 格式示例：**

```markdown
---
name: todo-extract
description: 从语音/文字记录中提取行动事项和待办
metadata:
  openclaw:
    extract_fields: ["todos"]
    always: true
---
提取用户提到的所有行动事项、待办事项、需要跟进的事情。
格式：每个待办为一个简洁的行动描述。
例如："下周一要给张总打电话" → "下周一给张总打电话"
```

---

## 5. WebSocket 消息协议

### 5.1 客户端 → Gateway

| type | payload | 说明 |
|------|---------|------|
| `asr.start` | `{ deviceId, locationText? }` | 开始语音识别 |
| (binary) | `ArrayBuffer` (PCM 16kHz mono) | 音频帧数据 |
| `asr.stop` | `{ deviceId, saveAudio? }` | 停止识别 |
| `asr.cancel` | `{ deviceId }` | 取消识别 |
| `process` | `{ text, deviceId, recordId }` | 触发 AI 处理 |
| `chat.start` | `{ deviceId, mode, dateRange }` | 开始复盘对话 |
| `chat.message` | `{ text, deviceId }` | 发送聊天消息 |
| `chat.end` | `{ deviceId }` | 结束对话 |
| `todo.aggregate` | `{ deviceId }` | 聚合待办 |

### 5.2 Gateway → 客户端

| type | payload | 说明 |
|------|---------|------|
| `asr.partial` | `{ text, sentenceId }` | 局部识别结果（实时） |
| `asr.sentence` | `{ text, sentenceId, begin_time, end_time }` | 确认的完整句子 |
| `asr.done` | `{ transcript, recordId, duration }` | ASR 完成 |
| `asr.error` | `{ message }` | ASR 错误 |
| `process.result` | `{ todos[], customer_requests[], setting_changes[], tags[], error? }` | AI 提取结果 |
| `chat.chunk` | `{ text }` | 流式文字片段 |
| `chat.done` | `{ full_text }` | 对话回复完成 |
| `error` | `{ message }` | 通用错误 |

---

## 6. REST API 接口

基地址：`http://<gateway-host>:<port>/api/v1`

### 6.1 Records

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/records?limit=&offset=` | 列表（含 summary, transcript, tags） |
| `GET` | `/records/:id` | 详情（含全部关联） |
| `POST` | `/records` | 创建记录 |
| `POST` | `/records/manual` | 创建手动笔记（可选 AI 处理） |
| `PATCH` | `/records/:id` | 更新字段 |
| `DELETE` | `/records` | 批量删除 `{ ids: [] }` |
| `GET` | `/records/search?q=` | 搜索 |

### 6.2 其他资源

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/todos?device_id=` | 待办列表 |
| `PATCH` | `/todos/:id/toggle` | 切换待办状态 |
| `GET` | `/tags` | 标签列表 |
| `GET` | `/skills` | 技能列表 |
| `PUT` | `/skills/:name` | 更新技能配置 |
| `GET` | `/health` | 健康检查 |

所有请求需附加 `X-Device-Id` 请求头。

---

## 7. AI 处理流程详解

### 7.1 ProcessEntry 内部流程

```
processEntry(payload) 被调用
│
├── 1. 加载技能 (loadSkills)
│   └── 从 gateway/skills/ 读取所有 SKILL.md
│       解析 YAML frontmatter + markdown prompt
│
├── 2. 查询设备技能配置 (skillConfigRepo)
│   └── 失败时降级：使用所有默认启用的技能
│
├── 3. 过滤活跃技能 (filterActiveSkills)
│   └── 根据设备配置 + 默认 enabled 状态
│
├── 4. 加载 Soul 用户画像 (loadSoul)
│   └── 失败时降级：无画像
│
├── 5. 加载 Memory 记忆 (loadContext)
│   └── 失败时降级：无记忆上下文
│
├── 6. 构建系统提示词 (buildSystemPrompt)
│   ├── 基础人设：智能笔记助手
│   ├── 用户画像（如有）
│   ├── 相关记忆（如有）
│   ├── 任务指令：分析记录 + 返回 JSON
│   ├── 技能提示词
│   └── 输出格式：严格 JSON，含示例
│
├── 7. 调用 AI (chatCompletion)
│   ├── 模型：qwen-plus
│   ├── 温度：0.3
│   ├── response_format: { type: "json_object" }
│   └── 超时：60 秒
│
├── 8. 解析 JSON 响应
│   ├── 成功：提取 todos, customer_requests, setting_changes, tags
│   └── 失败：设置 result.error，继续执行
│
├── 9. 写入数据库
│   ├── todos → todo 表
│   ├── customer_requests → customer_request 表
│   ├── setting_changes → setting_change 表
│   └── tags → tag + record_tag 表
│
├── 10. 更新 record 状态 → "completed"（失败时 → "error"）
│
└── 11. 后台任务
    ├── maybeCreateMemory：AI 判断是否保存为长期记忆
    └── updateSoul：更新用户画像
```

### 7.2 AI 返回的 JSON 格式

```json
{
  "todos": ["下周一给张总打电话", "准备季度报告"],
  "customer_requests": ["张总：包装换红色"],
  "setting_changes": [],
  "tags": ["工作", "客户沟通"]
}
```

---

## 8. 测试检查点

### 8.1 环境与启动

| # | 测试点 | 预期结果 | 检查方式 |
|---|--------|----------|----------|
| E1 | Gateway 启动（正常配置） | 输出 `[ai] Provider ready` + 监听端口 | 查看终端日志 |
| E2 | Gateway 启动（无 API Key） | 输出 `[ai] WARNING: DASHSCOPE_API_KEY is not set` | 删除 .env 中的 key 启动 |
| E3 | Gateway 启动（无数据库配置） | 抛出 `Missing RDS_HOST...` 错误 | 删除 RDS_* 变量启动 |
| E4 | 健康检查 | 返回 `{"status":"ok"}` | `curl http://localhost:3001/health` |
| E5 | 前端连接 Gateway | GatewayClient 建立 WebSocket 连接 | 浏览器控制台/Gateway 日志 `Client connected` |
| E6 | 前端断连重连 | 3秒后自动重连 | 重启 Gateway 观察前端日志 |

### 8.2 语音录音 (ASR)

| # | 测试点 | 预期结果 | 检查方式 |
|---|--------|----------|----------|
| A1 | 长按录音按钮 ≥300ms | 开始录音，显示波形动画 | 界面反馈 |
| A2 | 长按不足 300ms | 不触发录音 | 界面无反应 |
| A3 | 录音中实时转录 | 显示灰色部分识别文字 | 界面显示 `partialText` |
| A4 | 句子确认 | 灰色文字变为黑色确认文字 | 收到 `asr.sentence` 消息 |
| A5 | 松开结束录音 | 停止录音，触发 ASR 完成 | Gateway 日志 `[asr] Task finished` |
| A6 | 上滑锁定 (≥80px) | 进入锁定模式，显示全屏录音界面 | 界面切换 |
| A7 | 锁定模式点完成 | 结束录音并处理 | 同 A5 |
| A8 | 左滑取消 (≥100px) | 取消录音，丢弃数据 | Gateway 日志 `Session cancelled` |
| A9 | 锁定模式点取消 | 取消录音 | 同 A8 |
| A10 | 空录音（无有效语音） | 返回空 transcript，不创建 record | Gateway 不触发 processEntry |
| A11 | 麦克风权限被拒 | Toast 提示错误 | 浏览器弹窗拒绝后 |
| A12 | 录音期间 Gateway 断连 | 显示错误提示 | 录音中关闭 Gateway |

### 8.3 AI 处理 (Process)

| # | 测试点 | 预期结果 | 检查方式 |
|---|--------|----------|----------|
| P1 | 含待办的录音 | AI 提取 todos 数组 | Gateway 日志 `Parsed: N todos` |
| P2 | 含客户需求的录音 | AI 提取 customer_requests | Gateway 日志 |
| P3 | 无可提取内容 | 返回全空数组，无 error | Gateway 日志 `Parsed: 0 todos, 0 requests` |
| P4 | process.result 发送到前端 | 前端收到结果 | 浏览器 WS 面板 |
| P5 | record 状态更新 | 处理后变为 "completed" | 查询数据库 `SELECT status FROM record` |
| P6 | tags 写入 | tag 表 + record_tag 表有数据 | 数据库查询 |
| P7 | API Key 无效 | 返回 `error: "AI API error 401: ..."` | Gateway 日志 + 前端 error 消息 |
| P8 | AI 超时 (>60s) | 返回 `error: "AI API timeout"` | 模拟慢响应 |
| P9 | AI 返回非 JSON | `error: "AI response is not valid JSON"` | Gateway 日志 |
| P10 | 数据库写入失败 | record 仍标记 completed，error 记录 | Gateway 日志 `DB write error` |
| P11 | processEntry 抛异常 | record 标记为 "error" | 数据库查询 |
| P12 | skill_config 表不存在 | 降级使用默认技能，不崩溃 | Gateway 日志 `Failed to load skill config` |
| P13 | memory 表不存在 | 降级无记忆，不崩溃 | Gateway 日志 `Failed to load memory` |
| P14 | soul 表不存在 | 降级无画像，不崩溃 | Gateway 日志 `Failed to load soul` |

### 8.4 文字输入

| # | 测试点 | 预期结果 | 检查方式 |
|---|--------|----------|----------|
| T1 | 输入普通文字 Enter | 创建手动笔记 + AI 处理 | 笔记列表刷新 |
| T2 | Shift+Enter | 换行，不发送 | 输入框多行 |
| T3 | 空文字 Enter | 不发送 | 无反应 |
| T4 | 输入 `/` | 显示命令菜单 | 弹出 autocomplete |
| T5 | 输入 `/review 上周` | 打开 ChatView | 全屏对话界面 |
| T6 | 输入 `/todo` | 聚合待办 | 待办视图更新 |
| T7 | 输入未知命令 `/xyz` | Toast "未知命令" | 界面提示 |

### 8.5 复盘对话 (Chat)

| # | 测试点 | 预期结果 | 检查方式 |
|---|--------|----------|----------|
| C1 | 启动复盘 | 连接 Gateway，发送 chat.start | WS 消息 |
| C2 | AI 开场白 | 流式显示 AI 回复 | ChatView 逐字出现 |
| C3 | 流式指示器 | 回复中显示 bounce dots | 界面动画 |
| C4 | 用户追问 | 发送 chat.message，收到流式回复 | WS 消息 |
| C5 | 关闭对话 | 发送 chat.end，界面关闭 | ChatView 消失 |
| C6 | Gateway 断连 | 显示连接状态提示 | 界面反馈 |
| C7 | 5秒连接超时 | 显示错误状态 | 界面反馈 |

### 8.6 手动笔记 REST API

| # | 测试点 | 预期结果 | 检查方式 |
|---|--------|----------|----------|
| R1 | POST /records/manual (useAi=true) | 创建记录 + 后台 AI 处理 | 数据库 record.status 先 processing 后 completed |
| R2 | POST /records/manual (useAi=false) | 创建记录，status=completed，不触发 AI | 数据库直接 completed |
| R3 | POST /records/manual (带 tags) | tags 写入 tag + record_tag 表 | 数据库查询 |
| R4 | POST /records/manual (无 X-Device-Id) | 返回错误 | HTTP 400/500 |

### 8.7 技能管理

| # | 测试点 | 预期结果 | 检查方式 |
|---|--------|----------|----------|
| S1 | 禁用 todo-extract 技能 | AI 处理不再提取 todos | process.result.todos 为空 |
| S2 | 启用 customer-request | AI 处理包含客户需求提取 | process.result.customer_requests |
| S3 | 所有技能禁用 | 仍返回 JSON（使用兜底格式） | Gateway 日志 `No active skills` |
| S4 | 添加自定义 SKILL.md | 热加载，下次处理生效 | 新增 gateway/skills/xxx/SKILL.md |

### 8.8 边界与异常

| # | 测试点 | 预期结果 | 检查方式 |
|---|--------|----------|----------|
| X1 | 极短录音 (<1秒) | 正常处理或空 transcript | 无崩溃 |
| X2 | 极长录音 (>5分钟) | 正常处理，可能触发 AI 超时 | Gateway 日志 |
| X3 | 并发多次录音 | 每次独立 session，互不干扰 | 不同 deviceId |
| X4 | 网络中断恢复 | 前端自动重连，重新录音正常 | 断网恢复后测试 |
| X5 | Gateway 重启 | 前端 3s 后自动重连 | 重启 Gateway |
| X6 | 数据库连接断开 | 错误日志，record 标记 error | Gateway 日志 |
| X7 | 发送非法 JSON 到 WS | 返回 `error: "Invalid JSON"` | WS 客户端 |
| X8 | 发送未知 message type | 返回 `error: "Unknown message type"` | WS 客户端 |
| X9 | 超大文本 (>10000字) | AI 正常处理 | 手动创建长笔记 |
| X10 | 特殊字符 (emoji, 代码块) | 不破坏 JSON 解析 | 输入含 emoji/代码的内容 |

---

## 9. 常见问题排查

### 9.1 Gateway 日志关键字速查

| 日志 | 含义 | 处理 |
|------|------|------|
| `[ai] WARNING: DASHSCOPE_API_KEY is not set` | API Key 未配置 | 检查 gateway/.env |
| `[ai] Provider ready` | AI 就绪 | 正常 |
| `[process] Starting for record xxx` | 开始处理 | 正常 |
| `[process] Loaded N skills` | 技能加载成功 | 检查数量是否正确 |
| `[process] Active skills: ...` | 活跃技能列表 | 检查是否有遗漏 |
| `[process] No active skills` | 无活跃技能 | 检查技能配置 |
| `[process] Failed to load skill config` | skill_config 表查询失败 | 检查 006 迁移 |
| `[process] Failed to load soul/memory` | 表查询失败 | 检查 006 迁移 |
| `[process] Calling AI...` | 准备调用 AI | 正常 |
| `[process] AI response length: N` | AI 返回了内容 | 检查 length > 0 |
| `[process] Parsed: N todos, ...` | 解析成功 | 正常 |
| `[process] Failed to parse AI response` | AI 返回的不是 JSON | 查看返回内容 |
| `[process] DB write error` | 数据库写入失败 | 检查表结构/权限 |
| `[process] Fatal error` | 整个处理流程崩溃 | 查看完整错误堆栈 |
| `[process] Record xxx marked as completed` | 处理完成 | 正常 |
| `[asr] Task started` | ASR 开始 | 正常 |
| `[asr] Task finished` | ASR 结束 | 正常 |
| `[asr] Task failed` | ASR 失败 | 检查 DashScope 状态 |
| `[asr] Process error` | ASR 后的 AI 处理失败 | 查看错误详情 |
| `AI API error 401` | API Key 无效/过期 | 更换 Key |
| `AI API error 429` | 请求频率过高 | 降低频率 |
| `AI API timeout` | AI 请求超时 | 增大 AI_TIMEOUT 或检查网络 |
| `AI API network error` | 网络不通 | 检查网络连通性 |

### 9.2 手动测试 AI API

```bash
curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
  -H "Authorization: Bearer sk-your-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-plus",
    "messages": [
      {"role": "system", "content": "返回 JSON: {\"test\": true}"},
      {"role": "user", "content": "hello"}
    ],
    "response_format": {"type": "json_object"},
    "temperature": 0.3
  }'
```

成功应返回：

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "{\"test\": true}"
    }
  }],
  "usage": { "prompt_tokens": ..., "completion_tokens": ... }
}
```

### 9.3 手动测试 WebSocket

使用 wscat 工具：

```bash
npx wscat -c ws://localhost:3001

# 发送 process 消息
> {"type":"process","payload":{"text":"明天要给张总打电话，讨论新包装方案","deviceId":"your-device-id","recordId":"your-record-id"}}

# 预期收到
< {"type":"process.result","payload":{"todos":["明天给张总打电话","讨论新包装方案"],"customer_requests":[],"setting_changes":[],"tags":["工作","沟通"]}}
```

### 9.4 检查数据库状态

```sql
-- 查看最近的录音记录及状态
SELECT id, status, source, created_at
FROM record
ORDER BY created_at DESC
LIMIT 10;

-- 查看卡在 processing 的记录
SELECT id, status, created_at
FROM record
WHERE status = 'processing'
  AND created_at < now() - interval '5 minutes';

-- 查看提取的待办
SELECT t.text, t.done, r.created_at
FROM todo t
JOIN record r ON r.id = t.record_id
ORDER BY t.created_at DESC
LIMIT 10;

-- 查看技能配置
SELECT * FROM skill_config;

-- 检查 006 迁移表是否存在
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('memory', 'soul', 'skill_config', 'customer_request', 'setting_change');
```
