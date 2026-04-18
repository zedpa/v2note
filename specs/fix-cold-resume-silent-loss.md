---
id: "fix-cold-resume-silent-loss"
title: "Fix: 本地优先捕获 — 录音/日记发送不依赖网络与鉴权"
status: active
domain: infra
risk: high
dependencies: ["recording-resilience.md", "chat-persistence.md", "voice-input-unify.md", "auth-core.md"]
superseded_by: null
backport: recording-resilience.md
created: 2026-04-17
updated: 2026-04-18
---

# Fix: 本地优先捕获 — 录音 / 日记发送不依赖网络与鉴权

## 概述

### 症状
用户反馈：App 长时间未使用后打开，**首次**操作（录音 / 文字输入）会静默失败——录音结束后无处理提示且完全丢失；文字点发送后输入框清空但消息从未到达后端。

### 原先错误的诊断方向
上一版 spec 把症状归因为"WS 没重连 + token 过期 + send 静默吞"，打算通过"主动重连 + 抛异常 + 明确错误文案"修复。这个方向**本质错误**。

### 正确的根因

**捕获路径强依赖网络与鉴权，违反了产品"混沌输入 + 本地优先"的核心原则。**

- 用户点录音 → 当前实现必须 WS OPEN + token 有效 + gateway ASR 在线，否则直接丢数据
- 用户点发送 → 当前实现必须 WS OPEN + token 有效，否则消息走不出去
- 整个写入链路上，**userID / 鉴权 / 网络 / gateway** 其中任一环节不可用 = 用户数据丢失

这不是"需要更好的错误提示"的问题，是"捕获本就不该依赖这些"的问题。

### 修复原则

> **userID / 鉴权 / 网络 / gateway 是"同步与扩展功能"的条件，不是"捕获"的前置条件。**

1. **捕获即落地**：用户任何创作动作（录音结束、文字发送）在点击瞬间就必须持久化到本地（IndexedDB），不等待任何网络/鉴权响应
2. **时间线即时可见**：本地持久化后，时间线立刻渲染该条目（status="captured"），不等 gateway 回包
3. **同步是异步的副作用**：有网络 + 有鉴权时，同步队列把本地条目推向 gateway，完成 ASR / AI 加工，回写丰富字段
4. **离线完全可用**：飞行模式下录音、打字、创建日记、查看自己已有记录全部正常；只有"AI 回复 / 跨设备同步 / gateway 侧的 topic/goal 挖掘"需要等网络

### 不在本 spec 范围

- 离线状态下的 AI 对话回复（chat query 返回 "离线"占位，后续独立 spec）
- Embedding / RAG 的本地化（继续走 gateway）
- 多设备离线冲突合并（未来 spec）

### 与既有 pending_retry 的共存原则（M3）

- **新捕获**（本 spec 上线后产生）全部走 `captureStore`
- **旧 pending_retry 服务端记录**（recording-resilience.md §1.3 创建的）保持现有重试 UI 不变
- 共存期通过 `POST /api/v1/records/:id/retry-audio` 端点继续服务旧数据，新链路不覆盖它
- `audio_blobs` store 允许复用既有 `v2note-audio-cache` 数据库；若字段不兼容则新增 v2 store 并迁移

### 上线顺序强约束（C1）

Phase 3（gateway client_id 幂等）**必须先于** Phase 4/5/6 上线并验证；前端通过 feature flag `offline_first_capture` 控制，回滚方案 = 关闭 flag，恢复老 send 直推路径。

---

## ⚠️ 写场景前必读：用户视角

本 spec 的验收标准是**用户观察不到"发送失败"状态**——因为捕获从不失败。用户只会看到：数据立刻出现在时间线，状态可能是"已保存（同步中）"或"已保存（离线）"，但**数据绝不丢失**。

---

## 1. 本地捕获存储（Capture Store）

### 场景 1.1: 存储统一的本地捕获条目
```
假设 (Given)  App 初始化
当   (When)   本地 IndexedDB 打开 v2note-capture 库
那么 (Then)   存在两个 object store：
              - captures：文字/日记/命令（不含大二进制）
              - audio_blobs：PCM/音频二进制（沿用 v2note-audio-cache，如已有则复用）
并且 (And)    captures schema：
              {
                localId: string,              // UUID，客户端生成，主键
                serverId: string | null,      // 同步成功后回写的后端 record/message id
                kind: "diary" | "chat_user_msg" | "todo_free_text",
                text: string | null,          // 文字内容（录音可留空，transcript 由后端补）
                audioLocalId: string | null,  // 指向 audio_blobs.id（录音场景）
                sourceContext: "fab" | "fab_command" | "chat_view" | "chat_voice",
                forceCommand: boolean,
                notebook: string | null,
                createdAt: string,            // ISO 本地生成时间
                userId: string | null,        // 捕获瞬间的用户 id；若未登录则 null
                syncStatus: "captured" | "syncing" | "synced" | "failed",
                lastError: string | null,
                retryCount: number,
              }
并且 (And)    IndexedDB 不可用时（隐私模式/旧浏览器）→ 回落到 localStorage 小存储 + 提示"建议使用支持 IndexedDB 的浏览器"
```

### 场景 1.2: 时间线合并本地 + 服务端
```
假设 (Given)  时间线视图打开
当   (When)   加载数据
那么 (Then)   并发从两个源取：
              1. 本地 captures（syncStatus ∈ captured/syncing/failed/synced 且 audioLocalId 未清理）
              2. 服务端 records（带分页；响应必须含 client_id 字段）
并且 (And)    以 localId ↔ serverId ↔ client_id 三角桥去重：
              a. 本地 synced 且 serverId 匹配到服务端行 → 使用服务端版本
              b. 本地 captured/syncing/failed 但 client_id 等于服务端某行的 client_id →
                 判定为"ack 丢失的成功"，本地升级为 synced 并回写 serverId
              c. 纯本地未同步条目 → 按 createdAt 插入
              d. 纯服务端条目（无本地对应）→ 正常渲染
并且 (And)    服务端请求失败 → 时间线仍渲染本地条目，触发 §5.2 状态条
并且 (And)    分页：服务端分页按 createdAt desc 拉；本地未同步条目始终置顶渲染，不参与服务端分页
```

### 场景 1.3: IndexedDB 跨 store 原子写入（C3）
```
假设 (Given)  创建一条含 audio 的 capture
当   (When)   captureStore.create 被调用
那么 (Then)   在单个 readwrite 事务中同时写入 captures 行 + audio_blobs 行
并且 (And)    任一 store 写入失败 → 整个事务回滚，捕获视为失败（罕见，UI 需给明确错误）
并且 (And)    App 启动时执行 GC 扫描：
              - captures.audioLocalId 指向不存在的 audio_blobs 行 → 标记 failed + lastError="audio_lost"
              - audio_blobs 无任何 captures 引用 → 删除（孤儿清理）
并且 (And)    audio GC 前必须先读完 captures 外键引用
```

---

## 2. 录音捕获（FAB / FAB 上滑指令 / ChatView 语音）

### 场景 2.1: 录音结束立即本地落地（不等 WS / ASR）
```
假设 (Given)  用户通过任一入口录音（FAB 长按 / FAB 上滑指令 / ChatView 麦克风）
当   (When)   用户松手或点击停止
那么 (Then)   前端已累积的 fullBufferRef 立即写入 audio_blobs（复用现有 audio-cache 基础设施）
并且 (And)    同步创建一条 captures 记录：
              localId=<uuid>, kind="diary", audioLocalId=<上面的 blob id>,
              syncStatus="captured", sourceContext 来自触发入口
并且 (And)    FAB/ChatView 立即显示"已记录"成功提示（2 秒消失）
并且 (And)    时间线立刻出现该条目，标签"已保存（同步中）" + 本地音频可回放
并且 (And)    这一切在 **100ms 内**完成，**完全不依赖** gateway WS 状态 / auth token / 网络
```

### 场景 2.2: 启动录音不再卡在 waitForReady
```
假设 (Given)  App 刚从后台恢复或首次打开，用户立即触发录音
当   (When)   startRecording 被调用
那么 (Then)   立即启动 PCM 采集与本地 fullBufferRef 累积
并且 (And)    **不**在启动前 await waitForReady 阻塞
并且 (And)    后台异步尝试 ensureGatewaySession（见场景 4.1），用于实时转写预览
并且 (And)    若 gateway 暂不可用 → 录音继续，只是没有实时 partial text 显示（UI 不报错）
```

### 场景 2.3: 指令录音（asCommand=true）的本地落地
```
假设 (Given)  用户 FAB 上滑触发指令录音
当   (When)   录音结束
那么 (Then)   同样先落地 captures（kind="diary", forceCommand=true）
并且 (And)    若 gateway 可用 → 同步任务负责把 forceCommand 透传给后端处理
并且 (And)    若 gateway 不可用 → 条目保持 captured，时间线显示为普通待同步日记，不阻塞用户
并且 (And)    指令执行结果依赖 AI，完全离线时不产生副作用（不尝试本地模拟指令）
```

### 场景 2.4: ChatView 语音（useVoiceToText）降级
```
假设 (Given)  ChatView 点击麦克风，gateway 不可用
当   (When)   录音结束
那么 (Then)   fullBufferRef 仍写入 audio_blobs
并且 (And)    创建 captures 记录 kind="chat_user_msg", audioLocalId=<blob id>, text=null
并且 (And)    输入框显示"语音已保存，联网后自动转写"占位
并且 (And)    用户可继续打字发送；也可丢弃该语音（提供"撤销"按钮 5 秒内有效）
```

---

## 3. 文字捕获（ChatView 发送 / 日记输入）

### 场景 3.1: 点发送立即本地落地并清空输入
```
假设 (Given)  用户在 ChatView 输入"测试消息"
当   (When)   点击发送按钮或按回车
那么 (Then)   前端先创建 captures 记录：
              localId=<uuid>, kind="chat_user_msg", text="测试消息", syncStatus="captured"
并且 (And)    乐观消息立即加入聊天列表，状态"已保存（同步中）"
并且 (And)    输入框清空（因为数据已经安全落地）
并且 (And)    **不**等待任何 WS / ensureFresh / gateway 响应
```

### 场景 3.2: 同步队列负责后续
```
假设 (Given)  captures 中出现一条 syncStatus="captured" 的 chat_user_msg
当   (When)   同步调度器被唤醒（见 §4）
那么 (Then)   把该条推送到 gateway（走现有 WS chat.user 或 HTTP POST）
并且 (And)    成功 → 回写 serverId，syncStatus="synced"
并且 (And)    失败（网络/鉴权/gateway 错误）→ syncStatus 保持 captured（等下一次唤醒重试）
并且 (And)    消息在聊天中的显示状态根据 syncStatus 更新：
              captured/syncing → 小圆点"同步中"
              synced → 无额外标记（等同正常消息）
              失败且重试 > 3 次 → 小感叹号"同步失败 · 点击重试"，但消息内容始终可见
```

### 场景 3.3: 离线也能看到自己发过的消息
```
假设 (Given)  用户离线，已发送 3 条文字
当   (When)   打开其他页面再返回 ChatView
那么 (Then)   这 3 条消息仍按序显示
并且 (And)    右上角小标签"离线（3 条待同步）"
并且 (And)    用户不会看到"连接中"旋转或任何错误提示
```

### 场景 3.4: AI 回复在离线时如何表现（带 client_id 关联，C4）
```
假设 (Given)  用户发送的 chat_user_msg 期望 AI 回复，但离线
当   (When)   同步队列暂无法推送
那么 (Then)   聊天列表在该用户消息下显示灰色占位"AI 将在联网后回复"
并且 (And)    占位记录 pendingReplyFor = <user_msg.client_id>
并且 (And)    不插入任何伪造的 AI 消息
并且 (And)    联网后同步推送 chat.user，gateway 必须在 chat.chunk / chat.done 响应中回显 client_id
并且 (And)    前端按 client_id 把 AI 回复挂到对应用户消息下方，替换占位
并且 (And)    同一时刻只允许一条 chat_user_msg 推送，等待其 chat.done 后再推下一条（避免乱序回复）
```

### 场景 3.5: 斜杠命令离线拒绝（M2）
```
假设 (Given)  用户输入以 / 开头的消息（如 /compact, /skill:xxx 或前端注册的本地命令）
当   (When)   点击发送
那么 (Then)   若为纯前端命令（已在 executeCommand 命中）→ 正常执行（不依赖网络）
并且 (And)    若为后端命令（/compact 或需要 gateway 处理的 skill）→ 检查当前在线状态：
              - 在线 → 正常走同步流程
              - 离线 → 拒绝发送，输入框**保留内容**，提示"命令需要联网后执行"
并且 (And)    命令类消息**绝不**入 captures 队列（避免延迟执行产生上下文不一致）
```

---

## 4. 同步调度器（Sync Orchestrator）

### 场景 4.1: ensureGatewaySession 软恢复（不阻塞捕获）
```
假设 (Given)  同步调度器试图推送一条 captures
当   (When)   检查 gateway 会话
那么 (Then)   单飞（single-flight）地：
              1. 若 token 距离过期 < 5min 或已过期 → 尝试 Supabase refresh
              2. 若 ws 非 OPEN → 重置 reconnectAttempts 并 connect
              3. 等待最多 8 秒
并且 (And)    成功 → 后续推送使用该会话
并且 (And)    失败 → 记录本次失败理由，不做 UI 提示，等下次唤醒
并且 (And)    **此过程绝不阻塞用户的捕获动作**，它只在"后台同步"上下文运行
```

### 场景 4.2: 同步触发时机与串行语义（M1）
```
假设 (Given)  存在未 synced 的 captures
当   (When)   以下任一触发点发生
              - 应用启动（layout mount）
              - visibilitychange 变为可见 / App.resume / pageshow persisted=true
              - 网络从 offline 转 online（window 'online' 事件）
              - WS onopen 事件
              - 刚新增一条本地捕获
              - 手动点击"同步失败"条目的重试
那么 (Then)   触发进入 200ms debounce coalesce 窗口（多触发合并为一次扫描）
并且 (And)    调度器采用**全局单例 worker**模型：
              - 同一时刻只有一个推送流在进行
              - worker 按 createdAt 顺序串行推送 captured + failed 条目
              - 同一 localId 有 pending push 时拒绝再次入队（per-localId dedupe）
              - 新触发在 worker 运行中 → 标记 "has_pending_scan"，worker 完成后立即再扫
```

### 场景 4.3: 未登录用户的捕获也不丢（启用 · M4）
```
假设 (Given)  用户从未登录或已登出（冷启动允许跳过登录进入本地模式）
当   (When)   用户录音 / 打字
那么 (Then)   captures 照常创建，userId=null，并携带 guestBatchId=<当前 guest 会话 uuid>
并且 (And)    同步队列跳过 userId=null 的条目（没有归属无法推送）
并且 (And)    用户首次登录后 → 调度器把当前 guestBatchId 的条目 userId 回填为登录用户 id → 推送
并且 (And)    若之前已归入过别的账号（存在 userId != null 的未同步条目）→ 提示"你有 N 条未同步条目属于上一个账号，[同步到原账号 / 保留本地 / 删除]"
```

### 场景 4.3a: 登出时的处理（M4）
```
假设 (Given)  用户点击登出，存在未同步的 captures
当   (When)   触发登出
那么 (Then)   先尝试全量推送（阻塞 5 秒 UI loading）
并且 (And)    成功 → 正常清理 session，captures 保留（已同步）
并且 (And)    失败（离线等）→ 弹窗"有 N 条未同步，登出后这些数据仍保留在本设备上，需要联网并重新登录后才能同步。[确认登出 / 取消]"
并且 (And)    禁止静默丢弃任何 userId != null 的未同步条目
```

### 场景 4.4: 同步失败分类
```
假设 (Given)  推送 captures 失败
当   (When)   收到 gateway 失败响应
那么 (Then)   按错误类型分类处理：网络错误 / 5xx / gateway 未响应 → 保持 syncStatus="captured"，下次重试
并且 (And)    401 Unauthorized → 标记 syncStatus="captured"，触发一次 token refresh
并且 (And)    401 + refresh 连续失败 3 次 → 停止自动重试该条，标记 syncStatus="failed" + lastError="auth_refresh_exhausted"，用户重新登录后重置 retryCount
并且 (And)    403 Forbidden / 422 格式错误 / 400 业务拒绝 → syncStatus="failed"，retryCount += 1
并且 (And)    retryCount >= 5 → 在时间线/聊天中展示"同步失败（点击查看详情）"，但数据始终保留
```

### 场景 4.6: 长时间离线后大批同步的进度反馈（M6）
```
假设 (Given)  本地有 N 条未同步 captures（N >= 5）
当   (When)   网络恢复触发同步
那么 (Then)   顶部显示简洁进度条："同步中 x/N"，数字实时更新
并且 (And)    每条推送间隔 ≥ 200ms（节流避免 gateway 压力）
并且 (And)    进度条在全部 synced 或全部走到 failed 上限后消失
并且 (And)    用户可随时继续新捕获，不阻塞
并且 (And)    遇到 IndexedDB QuotaExceededError → 中断进一步写入，提示"本地存储已满，请先同步清理"，已捕获条目保留
```

### 场景 4.5: 同步成功后的本地清理策略
```
假设 (Given)  captures 条目同步成功（syncStatus="synced"）
当   (When)   满足以下任一条件
              - 纯文字条目（无 audioLocalId） → 7 天后清理 captures 记录（服务端已有真相）
              - 有 audioLocalId 的条目 → 不自动清理，保留在本地便于离线回放
那么 (Then)   清理只删 captures 行，不删 audio_blobs（音频清理策略仍由 recording-resilience.md §1.5 管理）
```

---

## 5. UI 反馈契约

### 场景 5.1: 同步状态始终可见但不打扰
```
假设 (Given)  时间线 / 聊天中有条目
当   (When)   渲染每一条
那么 (Then)   syncStatus="captured" 或 "syncing" → 条目右下角极小 ⏳（不抢焦点）
并且 (And)    syncStatus="synced" → 无额外图标
并且 (And)    syncStatus="failed"（retry 未到上限）→ 与 synced 视觉一致，不提示错误
并且 (And)    syncStatus="failed" 且 retryCount >= 5 → 右下角淡红色 ⚠，点击展开"同步失败：<reason>  [重试] [删除]"
```

### 场景 5.2: 全局状态条（离线 vs 服务不可用）（M5）
```
假设 (Given)  当前同步状态异常
当   (When)   系统根据 navigator.onLine + ws 状态判定
那么 (Then)   navigator.onLine === false → 灰色条"离线 · 已保存到本地，联网后自动同步"
并且 (And)    在线但 ws 连续 30 秒未能 OPEN → 黄色条"同步暂不可用 · 数据已安全保存"
并且 (And)    首次连接的前 15 秒 / resume 后的前 15 秒不显示任何条（避免误报）
并且 (And)    状态恢复后条消失，不打扰
并且 (And)    禁止任何"网络未连接，录音已取消 / 发送失败"类型阻塞提示
```

### 场景 5.3: 清除旧版错误文案
```
假设 (Given)  代码中存在以下旧版错误提示
              - "无法连接服务器，请检查网络"
              - "发送失败，请检查网络"
              - "录音已取消"
              - "网络未恢复，请稍后再试"
当   (When)   系统在捕获路径执行本 fix
那么 (Then)   这些提示在捕获路径上全部移除，改由同步队列静默重试
并且 (And)    只有"明确的、用户可操作"的场景才保留错误提示（例如 retry 5 次后的 [重试] 按钮）
```

---

## 验收行为（E2E 锚点）

> E2E 必须模拟"完全离线 / 仅断网 / 仅 token 过期 / 仅 gateway 挂了"四种情形。

### 行为 1: 飞行模式下录音完整可用
1. 用户开启飞行模式（network offline + ws 无法连接）
2. 长按 FAB 录音 3 秒松手
3. FAB 立即显示"已记录"，时间线立刻出现该条日记（带小 ⏳ 标记，本地音频可回放）
4. 关闭飞行模式，等待几秒
5. ⏳ 消失，条目转为正常日记（AI transcript + topic 等字段逐步回填）

### 行为 2: 飞行模式下发送文字完整可用
1. 用户开启飞行模式，在 ChatView 输入"测试消息" → 发送
2. 输入框立即清空，消息立刻出现在聊天列表（带 ⏳）
3. 切到时间线再切回聊天 → 消息仍在
4. 关闭飞行模式 → ⏳ 消失；若该消息期望 AI 回复，占位被真实回复替换

### 行为 3: token 过期 + gateway 挂了的长时间未用场景
1. 用户登录后后台 > 30 分钟（token 已过期，ws 已 CLOSE 且 reconnectAttempts 耗尽）
2. 切回 App，立即长按 FAB 录音 / 或立即打字发送
3. **不**出现任何"连接中 / 无法连接 / 发送失败"阻塞提示
4. 录音 / 消息立刻本地落地并在时间线/聊天可见
5. 后台同步调度器悄悄刷新 token + 重连 ws + 推送同步，最多几秒后条目状态转为 synced
6. 用户全程感知不到"首次操作静默失败"

### 行为 4: 本地条目在多次刷新页面后仍存在
1. 用户离线录制 2 条日记 + 发送 3 条文字
2. 刷新页面（Cmd+R）
3. 时间线与聊天都恢复全部 5 条，继续显示 ⏳
4. 联网 → 自动同步完成

---

## 6. Gateway 契约（本 spec 强约束）

> 以下 gateway 行为是本 spec 前置条件，Phase 3 必须先交付并灰度。

1. `POST /api/v1/records` 接受 `client_id`（= localId, UUID）字段；响应回显 `client_id`
2. 同一 `(userId, client_id)` 的重复 POST → 返回首次的 `serverId`，**不**创建重复记录
3. `GET /api/v1/records` 每行返回 `client_id`（若该记录由新链路创建）
4. `WS chat.user` 消息 payload 接受 `client_id`；gateway 在 `chat.chunk` / `chat.done` 响应中回显该 `client_id`
5. 同一 `(userId, client_id)` 的 chat.user 重复 → 返回原 AI 回复，不重复生成
6. 服务端 `(userId, client_id)` 建唯一索引，DB 层兜底幂等

安全说明：`client_id` 只是幂等键，不是鉴权凭证；`userId` 由 session 绑定，攻击者无法通过伪造 `client_id` 跨账号污染。

---

## 边界条件

- [ ] IndexedDB 不可用（Safari 隐私模式）→ 文字类 capture 降级 localStorage；**录音类必须 IndexedDB**，不可用时提示"当前环境不支持录音，请使用 Chrome/Edge 或关闭隐私模式"
- [ ] 本地捕获累计 > 50MB（音频为主）→ 提示但不阻止（沿用 recording-resilience.md 1.5.4）
- [ ] 刷新/关闭页面瞬间 PCM 累积还没写入 IndexedDB → 已存在的 fullBufferRef 无法恢复（这是不可避免的内存丢失，由 recording-resilience.md 声明）
- [ ] 同步重复推送（retry 导致）→ gateway 端按 localId 去重（接口需支持 client_id / idempotency_key）
- [ ] 两台设备同时离线编辑 → 合并策略不在本 spec（未来多端同步 spec）
- [ ] 用户登录不同账号后的 userId=null 条目归属 → 见场景 4.3
- [ ] 同步失败条目超过 retryCount=5 → 用户可手动重试或删除，绝不自动丢弃
- [ ] 未完成同步时用户清浏览数据 → 提示"有 N 条本地待同步条目将丢失，继续？"（若浏览器暴露 beforeunload 钩子）
- [ ] Capacitor 原生壳 / HarmonyOS → 复用同一本地存储策略（IndexedDB 在 WebView 中可用）
- [ ] `kind="todo_free_text"` 本 spec 不展开实施（todo 当前走 HTTP 且已有独立失败处理）；字段保留以备未来统一
- [ ] beforeunload 拦截在移动端 WebView / iOS Safari 不保证生效 → 不作为数据安全的依赖，只作辅助提示
- [ ] §2.4 5 秒撤销 = 仅删除本地 captures + audio_blobs 行，不触及 gateway（捕获未同步时无服务端副作用）
- [ ] 极长离线（> 7 天）→ 提示"本地有 N 条 / xMB 未同步，建议尽快联网"；不自动丢弃

## 接口约定

### 本地存储（shared/lib/capture-store.ts，新建）

```typescript
export interface CaptureRecord {
  localId: string;
  serverId: string | null;
  kind: "diary" | "chat_user_msg" | "todo_free_text";
  text: string | null;
  audioLocalId: string | null;
  sourceContext: "fab" | "fab_command" | "chat_view" | "chat_voice";
  forceCommand: boolean;
  notebook: string | null;
  createdAt: string;
  userId: string | null;
  syncStatus: "captured" | "syncing" | "synced" | "failed";
  lastError: string | null;
  retryCount: number;
}

export const captureStore = {
  create(input: Omit<CaptureRecord, "localId" | "createdAt" | "syncStatus" | "retryCount" | "serverId" | "lastError">): Promise<CaptureRecord>;
  update(localId: string, patch: Partial<CaptureRecord>): Promise<void>;
  get(localId: string): Promise<CaptureRecord | null>;
  listUnsynced(): Promise<CaptureRecord[]>;
  listByKind(kind: CaptureRecord["kind"], limit?: number): Promise<CaptureRecord[]>;
  delete(localId: string): Promise<void>;
};
```

### 同步调度器（shared/lib/sync-orchestrator.ts，新建）

```typescript
/**
 * 全局单例。由 layout 初始化。
 * 监听：app resume / visibility / online / ws open / 新捕获 / 手动重试。
 */
export function startSyncOrchestrator(opts: {
  refreshAuth: () => Promise<boolean>;
  ensureWs: () => Promise<boolean>;
  pushCapture: (c: CaptureRecord) => Promise<{ serverId: string }>;  // 失败时抛错
}): () => void;

export function triggerSync(): void;   // 外部手动触发
```

### 现有 gateway-client 调整

- `send` / `sendBinary` **不再**做静默 drop；但也**不再**是捕获路径的必经点
- 仅由 sync-orchestrator 内部使用（捕获路径不直接调用）
- 保留 `trySend` 用于真正尽力而为的场景（cancel / unmount）

### 后端接口要求（gateway 侧，本 spec 只描述约束）

- `POST /api/v1/records` 与 `WS chat.user` 必须支持 `client_id`（= localId）字段用于幂等
- 同 client_id 重复请求 → 返回第一次的结果，不重复处理
- Records 返回体包含 `client_id` 让前端匹配回写

## 依赖

- `recording-resilience.md` — 已有 audio_blobs IndexedDB 与 pending_retry UI，本 spec 扩展其语义为通用本地捕获
- `chat-persistence.md` — 聊天持久化，本 spec 新增 sending/failed 前端展示态
- `auth-core.md` — Supabase refresh
- `voice-input-unify.md` — useVoiceToText 适配本地落地
- gateway: `POST /records` 与 `chat.user` 的 client_id 幂等支持

## Implementation Phases（实施阶段）

- [ ] Phase 1: `capture-store.ts` IndexedDB 封装（迁移/复用 audio-cache.ts 部分能力）
- [ ] Phase 2: `sync-orchestrator.ts` 调度核心（ensure + 串行推送 + 触发时机）
- [ ] Phase 3: gateway 接口支持 client_id 幂等（records POST + chat WS）
- [ ] Phase 4: FAB / useVoiceToText 录音结束直接走 capture-store，不再 await WS
- [ ] Phase 5: ChatView handleSend 改为本地先落地，乐观消息基于 syncStatus 展示
- [ ] Phase 6: 时间线/聊天读取合并本地 + 服务端，去重按 localId↔serverId
- [ ] Phase 7: 清理旧版阻塞错误文案；引入全局"离线条"
- [ ] Phase 8: 未登录捕获 + 登录后归属策略（谨慎，可按 onboarding 现状选择启用）

## 备注

### 与上一版 spec 的关系
上一版方向（主动重连 + 抛异常 + 明确失败提示）被整体替换。保留的少量内容：
- `resetReconnectBackoff()` 仍有用（给同步调度器的 ensureWs 使用）
- `trySend` 仍保留（cancel / unmount 场景）
- `SendFailedError` 仅限 sync-orchestrator 内部使用，不对业务层暴露

### 产品原则一致性
本 spec 把 CLAUDE.md 中"混沌输入 + AI 沉默为主"的原则落到基础设施层：
- 捕获层对用户**永远响应成功**（只要本地能写）
- AI 加工层作为异步副作用运行，其成功/失败不影响捕获
- userID 只是同步的路由键，不是捕获的门票

### 回归测试要求
回归测试的 describe 块必须标注 `regression: fix-cold-resume-silent-loss`，覆盖至少 4 条路径：
1. 飞行模式 FAB 录音 → 本地落地 + 时间线可见
2. 飞行模式 ChatView 发送文字 → 本地落地 + 聊天可见
3. token 过期 + ws 挂 → 首次操作不阻塞，后台同步成功
4. 刷新页面后本地条目仍在并能继续同步
