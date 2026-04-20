# Bug Log

> 记录每次 bug 修复的现象、根因、修复方式，以及流程改进。
> Agent 每天开始工作前检查此文件，判断是否有可提炼为 CLAUDE.md「已知陷阱」的通用规则。

## 记录格式

### [日期] [类型: bug/流程改进] 简述
- **现象**：用户看到了什么 / 流程哪里不顺
- **根因**：代码哪里出了问题 / 流程哪个环节有缺陷
- **修复**：怎么修的 / 怎么改进的
- **回归测试**：`[测试文件路径]` — 标注 `regression: fix-xxx`（bug 类型必填）
- **教训**：这类问题的通用防护规则（如果有）
- **已提炼**：✅ 已写入 CLAUDE.md / ❌ 仅此例，无通用性

---

## 日志条目

（按时间倒序，新条目添加在此处下方）

### 2026-04-20 [bug] 老账户误触发新手引���（2问+点击引导）
- **现象**：老用户清除 App 数据或换设备后，重新打开 App 会再次看到新手名字输入页和 CoachMark 点击引导
- **根因**：`app/page.tsx` Layer 3 用 `GET /records?limit=1` 做代理判断，但：(1) records 是间接指标，后端有权威的 `user_profile.onboarding_done` 字段未使用；(2) `.catch(() => setIsFirstTime(true))` 在网络失败时默认显示引导，老用户冷启动弱网就会中招
- **修复**：(1) 后端新增 `GET /api/v1/onboarding/status`，直接查 `user_profile.onboarding_done`；(2) 前端 Layer 3 改用新接口；(3) catch 改为不显示引导（新用户下次打开重检测）；(4) 后端加 try/catch 防 DB 异常
- **回归测试**：`gateway/src/routes/onboarding.test.ts` > `describe("GET /api/v1/onboarding/status")` — 6 个用例（done=true/false/null/无 profile/DB 异常/401）
- **教训**：onboarding 状态判断应查权威数据源（`onboarding_done` 字段），不要用 records 数量做代理。错误 fallback 方向应保护老用户（不显示），而非保护新用户（显示）——老用户被迫重走引导的体验损害远大于新用户错过一次引导
- **已提炼**：❌ 仅此例

### 2026-04-20 [bug] OSS 图片流量风暴：签名不复用 + 客户端轮询无死线 + 僵尸记录无清扫 → 单日 43GB 流出、7 张图被下载 6000 次/张
- **现象**：CDN/OSS 观测到个别图片被重复下载数千次；日流量尖刺。
- **根因**：
  1. `gateway/src/storage/oss.ts::getSignedUrl` 每次调用 `client.signatureUrl`，签名 query 变化 → 浏览器/CDN 视为新资源重复下载（场景 1/2）。
  2. 记录卡在 `uploading/processing` 无人清扫 → 前端 `useNotes` 无限轮询 → 每轮重新拉 listRecords → 每条图片 → 签名被重签 → HTTP 重新命中（场景 3）。
  3. 前端无轮询死线/可见性控制/下拉恢复（场景 4/5/6）。
  4. 浏览器无本地图片缓存，即使同一 recordId 已下载过，切到其他页面再回来仍重新发请求，且离线看不到已下载过的图（场景 7/8）。
- **修复**（specs/fix-oss-image-traffic-storm.md 完整 4 层防御）：
  - L1 后端签名 TTL 缓存：`gateway/src/storage/oss.ts` 新增 `signCache` + `SIGN_TTL_SEC=3600` + 5 分钟刷新提前量；HTTP URL 先归一化到 objectKey 再查缓存（场景 1/2）
  - L2 僵尸清扫：`gateway/src/jobs/sweep-stale-records.ts` 每 10 分钟 UPDATE uploading/processing → failed（阈值 30min，行锁幂等）；入口注册在 `gateway/src/index.ts::startStaleRecordSweeper()`（场景 3）
  - L3 前端轮询治理：`features/notes/hooks/use-notes.ts` POLL_INTERVAL=5s / POLL_MAX_MS=10min / MAX_ROUNDS=120；visibilitychange=hidden 跳本轮，visible 重置 + 立即拉；pull-to-refresh `refresh()` 重置计数 + 恢复 autoRefreshPaused（场景 4/5/6）
  - L4 客户端图片缓存：`shared/lib/image-cache.ts`（IndexedDB `v2note-image-cache`, key=record_id, 100MB LRU by lastAccessedAt）+ `features/notes/hooks/use-cached-image.ts`（data: passthrough / 命中 → blob URL / 在线 miss → fetch + put / 离线 miss → null）。`notes-timeline.tsx` + `note-detail.tsx` 双路径同步接入（场景 7/8）
  - Phase 0 DB 回填：`supabase/migrations/069_backfill_stale_records.sql` — 一次性将历史僵尸记录置 failed，消除当前轮询压力
  - E2E 辅助：`gateway/src/routes/test-helpers.ts`（ENABLE_E2E_HELPERS=1 门控，仅种 stale record）
- **回归测试**：
  - `gateway/src/storage/oss.test.ts` > `describe("getSignedUrl [regression: fix-oss-image-traffic-storm]")` — 4 个（同 key 同 URL / 不同 key / http 归一化 / 过期刷签）
  - `gateway/src/jobs/sweep-stale-records.test.ts` > `describe("sweepStaleRecords [regression: fix-oss-image-traffic-storm]")` — 5 个（swept 计数 / 秒级 interval / 零记录 / 并发幂等 / env 阈值）
  - `shared/lib/image-cache.test.ts` > `describe("image-cache [regression: fix-oss-image-traffic-storm]")` — 7 个（miss→null / put+get / upsert / sum / LRU 清理 / delete / clearAll）
  - `features/notes/hooks/use-cached-image.test.ts` > `describe("useCachedImage [regression: fix-oss-image-traffic-storm]")` — 5 个（data: 短路 / 命中 blob / miss+online fetch+put / miss+offline null / null 参数）
  - `features/notes/hooks/use-notes.test.ts` > `describe("useNotes polling [regression: fix-oss-image-traffic-storm]")` — 4 个（MAX_ROUNDS 暂停 / hidden 跳过 / visible 重置 / refresh 恢复）
  - E2E `e2e/oss-image-traffic.spec.ts` 6 个场景（行为 7/8 含 `context.setOffline(true)` 离线验证）— 未跑（Playwright 基础设施 hang，见 MEMORY feedback_e2e_blocked_skip），依赖单元测试 + 对抗性审查
- **教训**：
  - **签名 URL 必须本地归一化**：签名 query 变化不等于资源变化。任何拉 CDN 路径前先抽 objectKey，再用 TTL 缓存判等，避免把签名差异当成资源差异。
  - **轮询必须有死线 + 可见性 + 用户主动恢复**：无界轮询是 OSS 风暴的放大器；兜底三件套 MAX_ROUNDS + document.visibilityState + pull-to-refresh。
  - **"卡住就轮询" = 账单雪崩**：任何 "while processing → poll" 的前端逻辑必须配合后端清扫任务，否则异常 record 会变成永续请求源。
  - **本地缓存 key 选服务端稳定主键**：签名 URL / objectPath 都会变；IndexedDB key 必须是 record_id 这类业务主键，才能跨签名命中。
  - **IndexedDB 已有基建别重造**：`shared/lib/capture-store.ts` / `features/recording/lib/audio-cache.ts` / `features/chat/lib/chat-cache.ts` 已是 `v2note-*` 命名 + openDB/close/readwrite tx 模板，新的 `v2note-image-cache` 完全沿用，降低认知成本。
- **已提炼**：❌ 仅此例（领域陷阱可归入 docs/pitfalls/ 的"CDN/签名/本地缓存"章节，本次暂未新建）

### 2026-04-20 [bug] 冷启动 §8：懒绑定被 WS 未就绪门控 + WS open 无触发点 → 录音/文字仍丢
- **现象**：§7.7（`initAuth` 派发 restored）上线后，用户仍复现"长时间未使用打开软件→直接录音 / 直接打字发送→无提示，数据消失"。
- **根因**：
  1. `sync-orchestrator.runWorker()` 在 `ensureGatewaySession() === false` 时**整段 break**；懒绑定段（纯 IDB 操作）被网络就绪门控，导致 userId 永远无法回填。
  2. 触发点里没有 "WS closed → open" 边沿，`ensureWs` 首次失败后 WS 自然 OPEN 不会再次扫描；形成死锁（"懒绑定永不跑 + push 永不跑"）。
- **修复**（specs/fix-cold-resume-lazy-bind.md §8）：
  - `sync-orchestrator.ts::runWorker` 重排：先 `ensureGatewaySession` → `listUnsynced` → **无条件执行懒绑定段** → 若 `!sessionOk` 再 break（纯 IDB 的懒绑定永远跑完）
  - `SyncOrchestratorOptions` 新增 `subscribeWsStatus` / `getCurrentWsStatus`；`startSyncOrchestrator` 注册触发点 5，对 "非 open → open" 边沿触发 `triggerSync`。B2：订阅时用 `getCurrentWsStatus` 初始化 `lastWsStatus`，防止订阅晚于真实 open 错过边沿
  - `sync-bootstrap.tsx` 静态 import `getGatewayClient`，注入 `onStatusChange` / `getStatus` 到 orchestrator
- **Phase 3 P0 修复**（一起随本次合并）：
  - P0-1：worker finally 的 `setTimeout(triggerSync, 1000)` 改为立即 `triggerSync()`（`triggerSync` 自带 200ms debounce，不会压循环）—— 消除 1s 用户感知窗口
  - P0-2：跨账号污染防护 —— orchestrator 新增 `getLastLoggedInUserId` 选项，懒绑定前校验 `lastUserId !== currentUser.id` 时跳过并交 guest-claim UI 同意流程处理。镜像 `guest-claim.ts` 的既有防护
  - P0-3：`should_register_ws_unsubscribe_in_globalListeners` 测试加强 —— stop() 后再调 `wsHandler("closed"); wsHandler("open")`，断言 `pushCapture` 调用数不变
- **回归测试**（11 个新增 §8 测试 + 原有 §7.2 等测试保留）：
  - `shared/lib/sync-orchestrator.test.ts` > `describe("regression: fix-cold-resume-silent-loss §8")` 共 11 个
  - 核心锚点：`should_run_lazy_bind_even_when_ensure_session_returns_false`、`should_trigger_sync_on_ws_status_closed_to_open_edge`、`should_skip_lazy_bind_when_last_logged_in_user_differs`
  - E2E `e2e/fix-cold-resume-lazy-bind.spec.ts` 已编写（blocker 模式注入 FakeBlockedWebSocket），但因 Playwright 基础设施当前 hang（登录 + WS mock + networkidle 叠加 >5min 无输出）**未跑**。依赖单元测试 + Phase 3 对抗性审查作为主要保障
- **教训**：
  - **执行顺序契约**：本地优先（local-first）架构里，"纯本地状态更新段"与"依赖网络的段"必须拆开。默认先跑本地段、再判断 session，避免网络抖动导致的本地操作卡死。
  - **边沿触发 vs 状态回放**：`onStatusChange` 类订阅 API 若不回放当前状态，订阅方必须通过 `getCurrentState` 初始化 lastState，否则注册晚于事件时会错过边沿。
  - **跨账号复用设备**：任何账号相关的本地回填路径（lazy-bind / claim）都必须检查 `getLastLoggedInUserId() !== currentUser.id`，否则 A 的离线数据会被静默划给 B。
  - **长跑命令 pipe 陷阱**：`cmd | tail` 会让 `tail` 等管道关闭才输出，调试时用 `> file 2>&1` 直接写文件，避免把"无输出"误判为"hang"
- **已提炼**：✅ 执行顺序契约 / 边沿触发初始化 / 跨账号防护 三条已落到 `docs/pitfalls/timezone.md` 之外的通用规则；log pipe 陷阱已写入 user-memory

### 2026-04-19 [bug] 冷唤醒首次录音/文字发送静默丢失（Phase 9 运行时兜底）
- **现象**：Phase 5-8 基础设施已交付（captureStore + sync-orchestrator + FAB + ChatView + 游客 batch），但用户报告"长时间未用后打开软件，首次录音/文字发送**仍**会静默消失"。
- **根因**（三条并行）：
  1. `gateway-client.ts` WS 未就绪时 `send()` 静默丢弃控制帧（asr.start / chat.user）—— 冷启动窗口里被用户正常操作踩到
  2. `sync-orchestrator.ts` 过滤掉 `userId===null` 的 guest 条目；用户冷启动期"录完→登录完成"时序下，已入库条目因 userId 仍为 null 永远不推送
  3. `fab.tsx` / `use-voice-to-text.ts` 命令模式发 `asr.stop` 后无超时保护，gateway 不回包时 FAB 卡在等待态、用户以为"没反应"而离开
- **修复**（Phase 9，本 PR）：
  - §7.1 `features/chat/lib/pending-frames.ts` + gateway-client 内嵌队列：WS 未 OPEN 的控制帧先进队列，OPEN 后按序 flush（含 client_id 去重，防 WS 重连重放）
  - §7.2 `sync-orchestrator.ts` worker 内懒绑定：`userId===null ∧ guestBatchId===currentSessionBatchId` 时重绑定到 `getCurrentUser().id`，不改 synced 条目；批次不匹配跳过、无 batchId 僵尸警告
  - §7.3 `features/recording/lib/asr-timeout.ts` 纯状态机：12s 绝对超时 + partial 后 8s 尾包超时，降级时保持本地 capture 不动（forceCommand=true 不丢），UI 复位；迟到的 asr.done 只写 captureStore、不碰 UI
  - §7.4 `shared/lib/auth.ts` 新增 `auth:user-changed` CustomEvent（严格仅 login / logout 触发，silent refresh 不触发）+ `shared/lib/account-view-filter.ts` 按账号严格隔离本地条目可见性，timeline/chat 对此事件实时响应
- **回归测试**（新增）：
  - `features/chat/lib/pending-frames.test.ts` + `gateway-client-pending.test.ts`（13 + 6）
  - `shared/lib/sync-orchestrator.test.ts` 新 describe `lazy bind §7.2`（6）
  - `features/recording/lib/asr-timeout.test.ts`（18）
  - `shared/lib/auth-user-changed.test.ts`（6）
  - `shared/lib/account-view-filter.test.ts`（7）
  - 共 56 新单测，全部 regression: fix-cold-resume-silent-loss
- **教训**：
  - "基础设施已建好 + 用户还在丢数据" ≠ "再改基础设施"。运行时链路的每个分叉都要过"如果这步 5 秒内没回应，用户能不能挽回？"。一个没 timeout 的 send/await 就够用户丢一次输入。
  - 跨账号视图隔离必须在**单一读取入口**做（filterCapturesByAccountView），不能把它放进 mergeTimeline 也不能让每个调用者自行实现——否则下一次加第三个入口时漏一处就是 P0。
  - `auth:user-changed` 事件的语义必须**守住 silent refresh 不触发**这个边界——否则 sync-orchestrator 会在每次 token 刷新时扫全库，性能/数据归属都出问题。
- **已提炼**：❌ 待 Phase 3 审查后综合

### 2026-04-18 [bug] 冷唤醒首次录音/文字发送静默丢失（Phase 1-2 基础设施）
- **现象**：用户长时间未用打开 App 后首次录音 → 无处理提示、无新日记、录音完全丢失；首次打字发送 → 输入框清空但消息从未到达后端。
- **根因**（两层）：
  - 表层：`gateway-client.ts` `send()`/`sendBinary()` 在无 access_token 时 `console.warn + return` 静默吞消息；`chat-view.tsx:175` 在 send 后同步 `setInput("")`；无 `visibilitychange`/`App.resume` 守卫；`reconnectAttempts` 长时间后台后耗尽
  - 根层：**整个捕获链路强依赖网络/鉴权**，违反"混沌输入 + 本地优先"产品原则。userID 本应是同步路由键，却成了捕获前置。
- **修复方向**（spec-level）：本地优先捕获 — IndexedDB `captures` 表即时落地，同步调度器后台推送，userID 仅作同步键
- **本轮 Phase 1-2 基础设施**：
  - `shared/lib/capture-store.ts` — 跨 store 单事务 + 启动 GC + `CaptureNotFoundError`
  - `shared/lib/sync-orchestrator.ts` — 全局 worker + 200ms debounce + per-localId dedupe + 401 按 subject 隔离 + 30s 超时 + pending-scan 续触发
  - `features/chat/lib/gateway-client.ts` — `resetReconnectBackoff()`
- **待后续 PR**：Phase 3 gateway `client_id` 幂等；Phase 4 FAB 接入；Phase 5 ChatView 接入；Phase 6 时间线三角合并；Phase 7 UI 状态条；Phase 8 未登录归属
- **回归测试**：
  - `shared/lib/capture-store.test.ts`（regression: fix-cold-resume-silent-loss，含 C1/M4/M6/T5）
  - `shared/lib/sync-orchestrator.test.ts`（regression: fix-cold-resume-silent-loss，含 C2/C3/C4/M1/M2/M3）
  - `e2e/fix-cold-resume-silent-loss.spec.ts` — 9 个验收行为（暂未跑，等 Phase 4-5 FE 接入后执行）
- **教训**：
  - 用户反馈"静默丢失"时，**不要**首先考虑"加更好的错误提示"。要问：这个动作为什么需要网络才能成功？不需要就别等。
  - 对抗性审查对高风险基础设施有 4 Critical + 6 Major 的放大效应 — 并发/TOCTOU/tick 窗口这类问题不容易从正向实现看出
- **已提炼**：❌ 待后续 Phase 5/6 合并后综合提炼

### 2026-04-18 [流程改进] Spec 第一版诊断错误方向，用户点醒后整体重写
- **现象**：第一版 spec 把症状归因为"WS 断/token 过期/send 静默吞"，设计了"主动重连+抛异常+错误文案"路径。用户一句"为什么捕获要依赖网络？"直接否决整体方向。
- **根因**：Agent 在 Phase 1 偏重"复用现有机制"（gateway-client + session refresh），没回到产品原则（混沌输入 + 本地优先）去质疑"这条路径本该不存在"。
- **改进**：Phase 1 spec 撰写前，Agent 应先自问："这个路径上的每个外部依赖（网络/鉴权/服务）是必需的吗？若去掉它，能否仍满足用户需求？" 把这个提问作为 spec 概述的固定一节（"必需依赖 vs 可选依赖"清单）。
- **已提炼**：❌（下次若再出现类似"基础设施层的 fix 越做越偏"，再提炼为 CLAUDE.md 条目）

### 2026-04-16 [bug] 晚间总结路径分裂 + 明日预览包含已完成待办
- **现象**：晚间总结的"明天要做的事"中出现今天已完成的待办
- **根因**：`SmartDailyReport`(命令面板)走 legacy `report.ts`，将全量 pending 待办标记为 `todayPending` 喂给 AI，无显式 `tomorrowScheduled` 数据。v2 路径 `daily-loop.ts` 是正确的但未被命令面板调用
- **修复**：(1) `report.ts` evening 分支代理到 `generateEveningSummary`(v2)；(2) route 层补 `mode` 字段确保前端布局正确；(3) 删除死代码 `evening.md`/`morning.md`/`perspectives.md` + `EVENING_PROMPT`
- **回归测试**：无新增（gateway 测试环境缺依赖无法运行）
- **教训**：同一功能多条路径是高危模式 — handler 层统一入口，禁止路由层分叉到不同 handler
- **已提炼**：❌ 仅此例

### 2026-04-16 [bug] 随时时段创建待办被自动赋予 09:00 时间
- **现象**：在时间视图「随时」区域点 "+" 创建待办，提交后待办出现在「上午」时段而非「随时」
- **根因**：`todo-create-sheet.tsx` handleSubmit 中 `time || "09:00"` 将空时间回退为 09:00，导致 `assignTimeSlot` 把它归入 morning；编辑页 `todo-edit-sheet.tsx` 有同样的 09:00 回退 + 00:00 哨兵未识别问题
- **修复**：(1) 空时间用 `"00:00"` 哨兵替代 `"09:00"`，保留 scheduled_start 日期用于 filterByDate；(2) `assignTimeSlot` 中精确午夜 (hour=0, minutes=0) → "anytime"；(3) 编辑页 syncFromTodo 识别 00:00 为空时间、handleSave 同步用 00:00 哨兵
- **回归测试**：`features/todos/lib/time-slots.test.ts` — regression: fix-todo-anytime-time（4 个用例）
- **教训**：创建和编辑两条路径必须同步修复，审查时需检查 create/edit 对称性
- **已提炼**：❌ 仅此例

### 2026-04-13 [bug] goal_sync 目标重复生成 + 缺少层级组织
- **现象**：侧边栏和待办项目页中目标杂乱——重复的 goal（"学英语"+"英语学习"）、全部 L3 顶层平铺
- **根因**：(1) AI 编译时无已有 goal 列表上下文，无法去重；(2) allPageIndex 无 page_type，AI 不能区分 topic/goal；(3) goal page 硬编码 level=3 parent_id=NULL
- **修复**：prompt 注入 existingGoals + page_type 列 + 去重指令；DB 兜底 LOWER(TRIM(text)) 去重；goal page 按 parent_page_id 挂载（level=parent.level-1）；parent_page_id UUID 校验
- **回归测试**：`wiki-compiler.test.ts` 6 个 + `wiki-compile-prompt.test.ts` 6 个
- **教训**：AI 输出去重需双层防护——prompt 引导语义去重 + DB 层精确匹配兜底（加 LOWER+TRIM 归一化）
- **已提炼**：❌ 仅此例

### 2026-04-13 [bug] Layer 3 domain 废弃残留 → page_title 即时归类
- **现象**：AI prompt 仍指导生成 domain 字段但结果被丢弃，浪费 token；record 归类依赖异步 wiki-compiler，无即时反馈
- **根因**：Phase 11 废弃 domain 时只注释了 process.ts 的写入逻辑，prompt 和接口未同步清理
- **修复**：prompt §3 domain → page_title（AI 从已有 page 列表语义匹配）；process.ts 即时归类（精确匹配→link / 未匹配→create+link）；lightweight-classifier 跳过已归类 record
- **回归测试**：`process-classify.test.ts` — 9 个测试；`lightweight-classifier.test.ts` 更新跳过逻辑断言
- **教训**：废弃字段必须全链路清理（prompt→接口→解析→log），否则残留会持续浪费资源；token_count 增量操作跨模块时需防重复计数
- **已提炼**：❌ 仅此例

### 2026-04-13 [重构] Repo 层事务支持 — 消除 raw SQL 绕过 repo 的技术债
- **现象**：wiki-compiler executeInstructions 中 33 处 raw SQL 绕过 repo 层，知识图谱显示 8 个关键模块完全断裂
- **根因**：pool.ts 的 query/execute 不支持传入 pg.PoolClient，repo 方法无法在事务中使用
- **修复**：pool.ts 加可选 client 参数 → 5 个 repo 透传 → wiki-compiler 30 处 raw SQL 替换为 repo 调用 → manage-wiki-page + wiki.ts goal 创建提取共享函数
- **回归测试**：`gateway/src/db/pool.test.ts` — 19 个测试
- **教训**：事务内操作应通过 repo 层 + 可选 client 参数，而非直接 raw SQL。新增 repo 方法时应预留 client 参数
- **已提炼**：❌ 可考虑写入 CLAUDE.md 已知陷阱

### 2026-04-12 [bug] 录音按钮无法中断系统音频播放
- **现象**：用户按住录音按钮时，后台音乐不会暂停
- **根因**：(1) Pre-capture 阶段（120ms 后）打开麦克风但不请求音频焦点，音频焦点在 startRecording（长按确认后）才请求，存在时间窗口；(2) Android 使用 AUDIOFOCUS_GAIN_TRANSIENT，部分播放器只降低音量不暂停；(3) Android WebView getUserMedia 不会自动请求音频焦点（Chromium 已知行为）
- **修复**：startPreCapture 中在 getUserMedia 前调用 activateAudioSession()；stopPreCapture 和 catch 中添加 deactivateAudioSession()；Android 插件改用 AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
- **回归测试**：无（涉及原生平台音频硬件，无法自动化测试）
- **教训**：WebView 中 getUserMedia 不管音频焦点，必须用原生插件显式控制；录音场景用 EXCLUSIVE 而非 TRANSIENT
- **已提炼**：❌ 仅此例，原生平台特定问题

### [2026-04-12] [流程改进] 全面清除 deviceId 概念
- **现象**：deviceId 是早期无用户系统时的设备标识，遗留在 JWT、Session、WS 消息、Handler、前端 API 等 250+ 处引用
- **根因**：Migration 044 已将身份主键从 device_id 迁移到 user_id，但代码层未同步清理
- **修复**：JWT 移除 deviceId；Session key 改 userId；WS 消息全部移除 deviceId；前端 device.ts 改为 no-op；auth 路由 deviceId 改为可选；diary/manager 参数统一用 userId
- **回归测试**：`shared/lib/__tests__/device.test.ts`、`gateway/src/diary/manager.test.ts`
- **教训**：身份系统迁移时应一次性清理所有层（JWT → Session → WS → Handler → Frontend），不要只改 DB 层留下代码残留
- **已提炼**：❌ 此例特殊，无通用性

### [2026-04-12] [bug] 删除日记卡片报错 relation "strike" does not exist
- **现象**：用户删除日记时弹出「删除失败：relation "strike" does not exist」
- **根因**：migration 064 已删除 strike 表，但 `gateway/src/db/repositories/record.ts` 的 `deleteByIds()` 仍执行 `DELETE FROM strike WHERE source_id IN (...)`
- **修复**：全面清理 13 个文件中的 strike/bond 表引用。CRITICAL SQL（11处）全部改为 no-op 或迁移到 wiki_page。WARNING 字段（4处）删除 strike_id。LOW 测试 mock（5处）清理。
- **回归测试**：424 个单元测试全部通过
- **教训**：删除数据库表（DROP TABLE migration）后，必须全局搜索 `FROM/INTO/UPDATE/JOIN/DELETE FROM <table>` 并清理所有引用。仅清理触发报错的代码不够，非高频调用路径的残留 SQL 会在后续运行时爆炸。
- **已提炼**：✅ 写入 CLAUDE.md 已知陷阱

### [2026-04-12] [流程改进] UI/UX 审查 Round 1 移动端精修

- **现象**：移动端存在多项 WCAG/HIG 不达标问题（对比度、触控目标、ARIA 语义），首屏加载 51 个组件无懒加载，FAB 与弹窗层级冲突
- **根因**：UI 组件逐步累积未经系统性审查，shadcn/ui 基础组件合规但业务组件未跟进
- **修复**：
  - 对比度: --muted-foreground 52%→58%, --card 11%→13%
  - 触控: Header 按钮 min 44px, gap-1→gap-2, Tab min-h 48px
  - ARIA: tablist/tab 角色 + aria-selected + 关闭按钮 aria-label
  - 性能: 14 个 overlay 改为 dynamic import, 简报骨架屏(300ms 延迟防闪)
  - 视觉: 日记卡片 source_type 左边框, 待办时段指示条, 头像渐变 token 化
  - 层级: FAB 在任意弹窗/侧边栏打开时隐藏
- **回归测试**: `features/workspace/components/ui-ux-audit-r1.test.ts` — 26 个单元测试
- **教训**:
  - Tailwind transition 类冲突: 同一元素不能有 `transition-all` 和 `transition-[specific]`，后者会覆盖前者。应统一为一个 transition 声明覆盖所有属性。
  - FAB visible 逻辑需覆盖所有浮层（overlay + sidebar + suggestions），遗漏任何一个都会导致视觉遮挡
- **已提炼**: ❌ Tailwind transition 冲突为首次遇到，暂不提炼

### [2026-04-12] [bug] 早晚报待办过时 + 数据范围修正

- **现象**：早报展示大量与今天无关的古早待办（两周前创建无排期的），用户看到积压而非"今天要做什么"。晚报缺少日记亮点提取。
- **根因**：早报 `prioritizedTodos` 在今日排期和逾期之外，还用全量 pending 待办填充（`pendingTodos.filter(...)` fallback），导致古早待办占满列表。逾期判断用时间戳级比较，多日任务被错误标记为逾期。晚报 user message 只传日记 transcript 原文和条数，AI 无法提取结构化亮点。
- **修复**：(1) 早报移除全量 pending fallback，只展示 todayScheduled + overdue；(2) overdue 改为日期级比较，增加 `endDate >= today` 排除多日任务；(3) 晚报增加 diaryEntrySummaries（每条 HH:mm + 前100字），insight prompt 改为"今日亮点"引导
- **回归测试**：`gateway/src/handlers/daily-loop.test.ts` — 标注 `regression: fix-briefing-stale-todos`（11 个测试用例）
- **教训**：传给 AI 的数据范围应精确匹配报告意图，全量数据 + "让 AI 自己挑" ≠ 精确过滤 + "AI 只处理相关的"
- **已提炼**：❌ 仅此例

### [2026-04-11] [bug] Wiki 编译管线多层 AI 幻觉导致 FK 违约

- **现象**：Wiki compile API 反复返回 500，每次修一个又冒出新的 FK violation。先后出现 6 种不同的失败模式，编译无法完成
- **根因**：AI（LLM）在编译指令中幻觉出不存在的 UUID，数据库执行时 FK 约束报错。具体 6 层问题：
  1. **UUID 格式非法**：AI 输出 `2aeebae7-4bfa-4bfa-4bfa-4bfa-4bfa-4bfa-4bfa`，不符合 UUID v4 格式
  2. **record_id 不存在**：`wiki_page_record` INSERT 引用了 AI 编造的 record ID
  3. **wiki_page_id 不存在（update_pages）**：AI 指令更新已被删除的 cluster 迁移空壳页面
  4. **wiki_page_id 不存在（split_page）**：AI 尝试拆分不存在的页面
  5. **wiki_page_id 不存在（merge_pages）**：AI 尝试合并不存在的页面
  6. **wiki_page_id 不存在（goal_sync）**：AI 在 goal_sync.create 中编造 wiki_page_id，todo INSERT 触发 FK
- **修复**：逐层添加防御性校验（wiki-compiler.ts）：
  1. `isValidUuid()` 正则校验所有 AI 输出的 UUID
  2. `wiki_page_record` INSERT 改为 `SELECT ... WHERE EXISTS (SELECT 1 FROM record WHERE id = $2)`
  3. `update_pages` 前 `SELECT 1 FROM wiki_page WHERE id = $1` 存在性检查
  4. `split_page` 前同样存在性检查
  5. `merge_pages` 前同样存在性检查
  6. `goal_sync` 的 `wiki_page_id` 先验证页面存在，不存在则置 null
- **回归测试**：`gateway/src/cognitive/wiki-compiler.test.ts`（已有 mock 测试覆盖主流程）
- **教训**：**LLM 输出的任何 ID（UUID/FK 引用）都不可信**。在执行 DB 写入前，必须对每个 AI 产出的 ID 做：(1) 格式校验（正则）；(2) EXISTS 存在性查询。不能假设 AI 只会引用 prompt 中给出的 ID——它会编造格式正确但不存在的 UUID，也会编造格式都不对的伪 UUID
- **已提炼**：✅ 已写入 CLAUDE.md（[AI 幻觉] 规则）

### [2026-04-11] [bug] Wiki 编译连接被 Supabase Pooler 杀死

- **现象**：编译第 1 批（30 条）成功后，第 2 批启动时报 `Connection terminated unexpectedly`，gateway 崩溃
- **根因**：`pg_try_advisory_xact_lock` 包裹在 `BEGIN...ROLLBACK` 事务中，但编译 AI 调用耗时 90-110 秒。Supabase Transaction Pooler（端口 6543）默认连接超时约 60 秒，长时间持有事务的连接被强制终止
- **修复**：将 `pg_try_advisory_xact_lock` 替换为进程内 `Set<string>` 内存锁。`compileLocks.add(lockKey)` 获取锁，`finally { compileLocks.delete(lockKey) }` 释放。单进程部署无需分布式锁
- **附带修复**：
  - `server.requestTimeout` 从 Node.js 默认 300s 延长到 600s
  - `server.headersTimeout` 和 `server.keepAliveTimeout` 同步延长
- **回归测试**：无（需真实数据库+长时间运行环境）
- **教训**：Supabase Transaction Pooler 不适合持有长事务（>60s）。advisory lock 包在事务中，事务被 pooler 杀死后锁丢失但编译也中断。对于单实例服务，内存锁比 DB 锁更可靠
- **已提炼**：✅ 已写入 CLAUDE.md（[数据库锁] 长事务规则）

### [2026-04-13] [bug] deviceId 残留导致录音失败+登录闪退+路由401

- **现象**：(1) 松开录音总是提示"录音已保存，待网络恢复后重试"但上滑正常 (2) 登录后立即退回登录界面 (3) 部分 API 返回 401
- **根因**：`fix-remove-device-id`（3c39ed9）清理了 JWT/WS/Session 层的 deviceId，但遗漏了三个层面：
  1. **数据库 schema**：`record.device_id` 仍是 NOT NULL，新代码不传 deviceId → INSERT 失败 → `asr.done` 无法发出 → 前端 15 秒超时
  2. **gateway 未重新编译**：`pnpm build` 有 TS 错误未修复，服务器运行的是旧编译产物，旧代码要求 login 必传 deviceId
  3. **路由层 `getDeviceId(req)`**：50+ 处调用，JWT 无 deviceId 时抛 401
- **修复**：
  1. 迁移 066：`ALTER TABLE record ALTER COLUMN device_id DROP NOT NULL`
  2. 修复 4 个 TS 编译错误，重新 build + 部署
  3. `getDeviceId` fallback 到 userId（临时），然后全面清理 18 个路由文件改用 `getUserId`
- **回归测试**：60 个（`device-id-cleanup.test.ts`），验证所有路由文件不再 import/调用 getDeviceId
- **教训**：身份体系迁移（deviceId→userId）必须一次性覆盖 JWT→WS→Session→HTTP路由→DB Schema→编译部署 全链路。遗漏任一层都会在不同时机爆炸：Schema NOT NULL → 录音失败；路由层 getDeviceId → API 401；未编译 → 旧代码阻止登录
- **已提炼**：✅

### [2026-04-11] [bug] Node.js HTTP 服务器默认超时截断编译响应

- **现象**：Wiki compile API 在约 300 秒时被截断，返回空响应（非 500），gateway 日志无错误
- **根因**：Node.js `http.Server` 默认 `requestTimeout = 300000`（5 分钟），多批次编译总耗时超过 5 分钟时，服务器主动关闭连接
- **修复**：在 `gateway/src/index.ts` 中设置：`server.requestTimeout = 10 * 60 * 1000`（10 分钟），`headersTimeout` 和 `keepAliveTimeout` 同步延长
- **回归测试**：无（需长时间运行环境）
- **教训**：Node.js HTTP 服务器有 3 个独立的超时配置（requestTimeout / headersTimeout / keepAliveTimeout），任何一个都可能静默截断长请求。需要所有三个都设置
- **已提炼**：❌ 仅此例

### [2026-04-11] [流程改进] Phase 12-13 Strike 引擎停用 + 代码清理

- **现象**：Wiki 编译管线验证通过后，执行 Phase 12（停用 Strike 引擎）和 Phase 13（前端展示迁移 + 代码清理）
- **变更清单**：
  - **daily-cycle.ts**：移除 `runBatchAnalyze`、`runEmergence`、`maintenance` 三步调用，替换为 `compileWikiForUser()` 单步
  - **report.ts**：数据源从 strike/bond/cluster 全面切换到 wiki page + record
  - **cognitive-stats.ts**：stats 改查 wiki page 数据；`/cognitive/compile` 替代 `/cognitive/batch-analyze`
  - **strikes.ts / cognitive-clusters.ts**：路由返回空/410，标记 @deprecated
  - **goals.ts**：移除 `debug-emergence`、`emergence`、`backfill` 路由
  - **前端删除**：`strike-preview.tsx`、`use-strikes.ts`、`life-map.tsx`、`cluster-detail.tsx`、`use-cognitive-map.ts`、`stats-dashboard.tsx`
  - **note-card.tsx**：移除 StrikesSection 渲染
  - **todo-workspace-view.tsx**：`cluster_id` 引用改为 `wiki_page_id`
  - **domain-config.ts**：标记 @deprecated
- **测试结果**：前端 328/328 通过；Gateway 625/625 通过（10 个预存在失败，无新增）
- **教训**：大规模引擎替换应分两步：先验证新引擎（Phase 11 Wiki 编译），再停用旧引擎（Phase 12-13）。避免同时切换导致无法定位问题
- **已提炼**：❌ 流程经验，无代码规则

### [2026-04-11] [bug] 早晚报绕过 v2 prompt 架构 + 时区 bug
- **现象**：(1) 早晚报 Soul 截断到 200 字，不加载 UserAgent/Memory/Wiki/Goals (2) `toDateString` 用 `toISOString()` 返回 UTC 日期，北京 0:00-8:00 间日期筛选错一天 (3) 早报缺目标进度，晚报缺日记洞察
- **根因**：daily-loop.ts 在 v2 架构重构后仍走老管线（内联 prompt + 散装 loadSoul/loadProfile），且 `toDateString` 违反时区契约
- **修复**：(1) 接入 `loadWarmContext(mode:"briefing")` + `buildSystemPrompt(agent:"briefing")`，Soul 完整注入 (2) `toDateString` 重命名为 `toLocalDateStr`，内部用 `toLocalDate()` 返回本地日期 (3) 早报新增 `goal_pulse`、晚报新增 `insight`/`affirmation` (4) 路由层 null 返回改为 `{disabled:true}` (5) `loadWarmContext` 加 try/catch 降级 (6) report.ts 同步修复
- **回归测试**：`gateway/src/handlers/daily-loop.test.ts` — 40 个测试；`e2e/briefing-v2.spec.ts` — 3 个 E2E 测试
- **教训**：新建 handler 或重构架构后，必须检查所有消费方是否同步接入新架构（daily-loop/report 被遗漏）；`toISOString()` 在日期比较中永远不安全
- **已提炼**：✅ CLAUDE.md 已有时区契约覆盖

### [2026-04-11] [bug] 图片插入后显示文字描述而非缩略图
- **现象**：用户插入图片后，时间线卡片显示 "[图片内容无法识别]" 文字而非图片缩略图
- **根因**：(1) ingest.ts 图片 record 的 source 设为 "manual" 而非 "image"，isImage 检测不可靠 (2) Vision AI 失败时 title/short_summary 存储无用 fallback 文字 (3) 缩略图在 DOM 中排在文字之后，不够醒目
- **修复**：后端 source 改为 "image"、Vision 失败时 title="图片" + short_summary=""；前端缩略图 DOM 顺序提前、图片无 short_summary 时不显示文字、img onError 使用 React state 管理
- **回归测试**：`features/notes/components/notes-timeline.test.tsx` + `gateway/src/routes/ingest.test.ts` — 标注 `regression: fix-image-thumbnail`
- **教训**：ingest 路由创建 record 时 source 字段应匹配实际来源类型，避免前端做 fallback 检测
- **已提炼**：❌ 仅此例，无通用性

### [2026-04-11] [bug] 待办项目视图添加后消失
- **现象**：在项目视图中添加待办后，待办立即消失。项目卡片始终显示 0 个任务。无论从项目详情页还是视图页直接添加都复现
- **根因**：`gateway/src/db/repositories/todo.ts` 的 `findByUser`/`findByDevice` SQL 查询包含 `AND t.parent_id IS NULL`，意图排除子任务，但同时排除了挂在项目/目标（level>=1）下的行动任务（level=0）。这些任务有 `parent_id` 指向项目，被错误过滤
- **修复**：将 `AND t.parent_id IS NULL` 改为 `AND (t.parent_id IS NULL OR p.id IS NOT NULL)`。利用已有的 `LEFT JOIN todo p ON p.id = t.parent_id AND p.level >= 1`：parent 是项目/目标时 `p.id IS NOT NULL`（返回），parent 是普通任务时 `p.id IS NULL`（排除子任务）
- **回归测试**：`gateway/src/db/repositories/todo.test.ts` — 标注 `regression: fix-todo-project-vanish`（4 个用例）
- **教训**：SQL WHERE 条件中用 `parent_id IS NULL` 排除子表记录时，如果 parent_id 有多种语义（指向不同 level 的实体），必须区分处理，不能一刀切
- **已提炼**：❌ 仅此例

### [2026-04-10] [bug] Wiki 编译 advisory lock 泄漏导致 compile 永久失效
- **现象**：wiki compile API 间歇性返回 `records_compiled: 0`，E2E 行为5 flaky（第一次 9.4 分钟超时失败，retry 才通过）。行为1/2 耗时从预期 1-2 分钟膨胀到 7-8 分钟
- **根因**：`wiki-compiler.ts` 使用 `pg_try_advisory_lock(hashtext(key))`（session-level lock）防止并发编译。但 Supabase 使用 transaction pooler（端口 6543），lock 和 unlock 被路由到不同的后端连接。unlock 在后端 B 执行，但锁实际在后端 A 上，导致锁永远不释放。后续所有 compile 调用 `pg_try_advisory_lock` 返回 false → 立即返回空结果
- **诊断过程**：
  1. 从 DB 查 record 状态 → 所有 record 都已 digested、compile_status 正确，排除 digest 问题
  2. 诊断脚本复现单 record 流程 → digest 5s + compile 37s = 正常
  3. 直接查 `pg_try_advisory_lock` → 返回 false → **锁被另一个 session 持有，无法释放**
- **修复**：
  1. 将 `pg_try_advisory_lock` 改为 `pg_try_advisory_xact_lock`（事务级锁）
  2. 锁操作包裹在 `BEGIN...ROLLBACK` 事务中，事务结束时锁自动释放
  3. 移除手动 `pg_advisory_unlock` 调用（不再需要）
- **附带修复**：
  - `findPendingCompile` 增加 `AND archived = false`，已删除日记不再参与编译
  - `compileWikiForUser` 改为循环处理所有 pending record（最多 5 轮 × 30 条），避免积压
  - compile 首轮无 pending 时等待 undigested record 完成（最多 90s）
  - compile AI 调用 tier 从 `report`(thinking:ON) 改为 `agent`(thinking:OFF)
- **回归测试**：`e2e/cognitive-wiki.spec.ts` 行为5 — 含 compile + page 关联检查 + AI fallback
- **教训**：PostgreSQL session-level advisory lock（`pg_advisory_lock/unlock`）在连接池的 transaction mode 下不可靠，lock 和 unlock 可能路由到不同后端。必须使用 `pg_advisory_xact_lock`（事务级，自动释放）或用行级锁替代
- **已提炼**：✅ 已写入 CLAUDE.md（[数据库锁] 规则）

### [2026-04-10] [bug] 日记删除后幽灵 Strike 残留
- **现象**：删除日记后，关联的 Strike 仍然存在（source_id=NULL），批处理后"幽灵"认知数据出现
- **根因**：migration 030 设置 strike FK 为 `ON DELETE SET NULL`，删除 record 后 strike 变成孤儿但仍为 active 状态。batch-analyze 的 `findActive()`/`getNewStrikes()` 不过滤 `source_id IS NULL`
- **修复**：
  1. `record.deleteByIds()` 先 `DELETE FROM strike WHERE source_id IN (...)` 再删 record
  2. 新增 migration 057 清理存量孤儿 strike（`source_id IS NULL AND is_cluster = false`）
- **回归测试**：无（需真实数据库环境，bond/strike_tag 的 ON DELETE CASCADE 由 DB 保证）
- **教训**：删除有 FK 子表的主表数据时，必须确认 FK 行为（CASCADE vs SET NULL）。SET NULL 会留下孤儿数据被后续管线处理
- **已提炼**：❌ 仅此例

### [2026-04-10] [bug] 登录时 ai_diary 唯一约束冲突
- **现象**：登录时报错 `duplicate key value violates unique constraint "idx_ai_diary_user_notebook_date_unique"`
- **根因**：`link-device.ts` 的 `linkDeviceToUser()` 对 `ai_diary` 表执行 `UPDATE SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`，但如果用户已有同一 `(user_id, notebook, entry_date)` 的条目（从另一设备），就违反唯一约束。`soul`/`user_profile` 表已有冲突处理，但 `ai_diary` 遗漏了
- **修复**：三步处理——先将冲突条目内容合并到已有 user 条目，再删除孤儿条目，最后无冲突条目正常绑定 user_id
- **回归测试**：无（需真实数据库环境）
- **教训**：对有唯一约束的表做批量 `UPDATE SET user_id` 时，必须先检查/处理冲突，不能盲目更新
- **已提炼**：❌ 仅此例

### [2026-04-09] [bug] 待办时间编辑后日期/时间偏移
- **现象**：待办创建为早上 9:00，编辑为下午 3:00 后，被移动到昨天下午 7 点。北京时间 0:00-8:00 的待办编辑后日期会错位到前一天
- **根因**：前端 5 处 `new Date(ts.replace(/Z$/i, ""))` 将 UTC ISO 时间戳的 Z 后缀剥离，导致浏览器将 UTC 时间当作本地时间解析，产生 -8 小时偏移。同时 `todo-workspace-view.tsx` 日期分组使用 `toISOString().split("T")[0]` 获取 UTC 日期而非本地日期
- **修复**：
  1. `date-utils.ts` `parseScheduledTime()` 移除 `.replace(/Z$/i, "")`，直接 `new Date(ts)`
  2. `todo-edit-sheet.tsx`、`todo-detail-sheet.tsx` 改用 `parseScheduledTime()`
  3. `use-todo-store.ts` `postponeTodo()` 改用 `parseScheduledTime()` + `localTzOffset()` 构造带偏移时间
  4. `todo-workspace-view.tsx` 时间显示移除 Z-strip；日期分组改用 `getLocalToday()`/`toLocalDateStr()`/`toLocalDate()`
  5. `todo-detail-sheet.tsx` `handleSave` useCallback 依赖数组补充 `priority`
- **回归测试**：`features/todos/lib/date-utils.test.ts` — 标注 `regression: fix-todo-time-shift`（6 个用例）
- **教训**：前端解析后端返回的 `timestamptz` 值时，禁止剥离 Z 后缀。`new Date(isoString)` 会正确解析 UTC 并通过 `getHours()`/`getDate()` 返回本地时间。`toISOString().split("T")[0]` 获取的是 UTC 日期，在 UTC+8 的 0:00-8:00 会错位
- **已提炼**：✅ 已写入 CLAUDE.md（前端时区 2 条规则）

### [2026-04-09] [bug] AI 工具调用结果丢失 + 系统性时区残留
- **现象**：(1) AI 搜索"今天的日记有几条"总是回答 0 条，即使后端查到了 4 条记录；(2) 搜索到 4 条今天的记录，AI 误判其中 1 条为昨天（因 UTC 日期 `04-08T17:23Z` 被直接展示）；(3) 多处 `new Date()` + `fmt()` 在 UTC 服务器上返回错误日期
- **根因**：三层问题叠加——
  1. **传输层**：`provider.ts` 手动工具循环中，Step 1 的 tool-result 消息不符合 AI SDK v6 的 `ModelMessage` schema（`output` 字段格式错误），导致 `InvalidPromptError`，模型收不到工具结果
  2. **决策层**：模型看到上下文中之前的"0 条"历史回答，直接复读而不调工具
  3. **显示层**：搜索结果的 `created_at` 直接暴露 UTC 时间（如 `2026-04-08T17:23:03Z`），AI 按 UTC 日期判断，误将北京时间 4/9 凌晨的记录归为 4/8
  4. **计算层**：`search.ts` 的 `resolveDate()`、`date-anchor.ts` 的 `fmt()/buildDateAnchor()` 等 10+ 个文件仍用 `new Date()`（服务器本地时间）而非 `tz.ts`（Asia/Shanghai）
- **修复**：
  1. **AI SDK v6 消息格式**：重写 `provider.ts` `streamWithTools` 的工具结果构造，`output` 使用 `{ type: "text", value: JSON.stringify(result) }` 符合 SDK discriminated union schema；移除已废弃的 `maxSteps: 1`（v6 用 `stopWhen` 替代，默认 `stepCountIs(1)`）；添加 Step 1 验证失败的 fallback（将工具结果作为文本消息重发）
  2. **强制工具调用**：`agents/chat.md` 增加"数据查询必须用工具"规则；`chat.ts` 增加 `isDataQuery()` 模式检测，匹配时注入系统提示强制模型调工具
  3. **UTC→本地时间显示**：新增 `tz.ts` `toLocalDateTime()` 函数（返回 `YYYY-MM-DD HH:mm` 北京时间）；`search.ts`、`view.ts`、`chat.ts`、`report.ts` 所有返回给 AI 的 `created_at`/`scheduled_start`/`generated_at` 统一用 `toLocalDateTime()` 转换
  4. **系统性时区修复**：`date-anchor.ts` `fmt()` 内部改用 `TZDate(Asia/Shanghai)` 解释任意 Date；`buildDateAnchor()`/`formatDateWithRelative()` 默认用 `tzNow()`；`search.ts` `resolveDate()` 改用 `tzToday()/daysAgo()/daysLater()`；`daily-loop.ts`/`report.ts`/`proactive/engine.ts`/`chat.ts`/`action-panel.ts`/`daily-cycle.ts` 的 `new Date()` 全部替换为 `tzNow()`
- **回归测试**：`gateway/src/handlers/daily-loop.test.ts` — 标注 `regression: fix-morning-briefing`（更新了 dayRange 期望值）；`gateway/src/lib/tz.test.ts`（22 个用例）
- **教训**：
  1. AI SDK 大版本升级（v5→v6）会静默改变消息 schema（`output` discriminated union、`maxSteps` 移除），必须读源码确认格式
  2. 时区修复不能只修数据查询层，还要修显示层——UTC 时间直接给 AI 看，AI 会按字面日期判断
  3. 工具调用链有 4 个可能断裂的层：模型决策→参数传递→执行→结果回传，每层都需要独立的观测日志
- **已提炼**：❌ 待提炼（AI SDK 消息格式 + UTC 显示层两条规则有通用性）

### 2026-04-08 [bug] 日历滑动与Tab切换手势冲突
- **现象**：待办页时间视图中，在日历条上左右滑动切换周时，同时触发了 tab 切换
- **根因**：page.tsx 的全局 handleTouchEnd 有 swipeable-task-item 的 closest 豁免，但缺少 calendar-strip/calendar-expand 的豁免，事件冒泡导致两个 handler 同时触发
- **修复**：在 page.tsx handleTouchEnd 的 closest 检查中增加 calendar-strip 和 calendar-expand
- **回归测试**：E2E 覆盖（纯 DOM 事件逻辑无法在 vitest 中有效模拟）
- **教训**：新增组件级水平手势时，必须同步更新 page.tsx 的全局手势豁免列表和 app-mobile-views.md 的手势规则枚举
- **已提炼**：❌ 仅此例，待观察是否再次出现

### [2026-04-08] [流程改进] Phase 1b spec 审查不得后台化
- **现象**：主 Agent 将 spec 审查 agent 放到后台运行，同时直接进入代码修改，审查结果回来时实现已完成
- **根因**：主 Agent 为追求速度，错误地将 Phase 1b（spec 审查）与 Phase 2b（实现）并行执行
- **修复**：在 CLAUDE.md「已知陷阱」中新增规则：Phase 1b 必须前台等待，审查→修正→用户确认后才能进入实现
- **教训**：审查的价值在于拦截实现前的 spec 偏差，后台化等于跳过审查
- **已提炼**：✅ 已写入 CLAUDE.md

### [2026-04-08] [bug] 早报时区错位 + 问候语基于待办
- **现象**：(1) 7:30 推送早报返回昨天的缓存内容；(2) 晨间问候语干燥，围绕待办数量，≤15字限制过紧
- **根因**：(1) `daily-loop.ts` 使用 `toISOString().split("T")[0]` 获取 UTC 日期，7:30 AM 北京时间 = UTC 前一天 23:30，缓存 key 命中昨日数据；(2) prompt 以"根据待办数据"为主语，soul/profile 仅附加 hint
- **修复**：
  1. `daily-loop.ts`、`engine.ts`、`report.ts` 所有日期计算改用 `fmt()`（本地时间），yesterday/tomorrow 改用 `setDate` 模式
  2. 晨间 prompt 改为"根据用户画像"，soul/profile 用 XML 标签包裹作为 prompt 主体
  3. greeting 字数从 ≤15 放宽到 ≤30
  4. `templates.ts` 同步更新，`report.ts` 补充 soul/profile 占位符替换
- **回归测试**：`gateway/src/handlers/daily-loop.test.ts` — 标注 `regression: fix-morning-briefing`（8 个用例）
- **教训**：日期相关逻辑必须统一使用 `fmt()`（本地时间），禁止直接用 `toISOString().split("T")[0]`。同一个 prompt 模板有多个消费者时，更新模板必须同步更新所有消费者的占位符替换逻辑
- **已提炼**：✅ 已写入 CLAUDE.md（[日期] + [模板] 两条规则）

### [2026-04-08] [bug] AI 生成标签数超过 5 个限制 + strike_tag 弃用
- **现象**：record 的标签数经常超过 5 个（设计上限），截图显示单条记录 6+ 个标签
- **根因**：fix-tag-limit 只修了 API 层和前端，遗漏了 gateway 内部 3 条 AI 写入路径（process.ts/digest.ts/batch-analyze.ts）。多条 strike 各自产生 tags 累加写入同一 record，无总量控制
- **修复**：
  1. unified-process-prompt 加"最多5个"硬限
  2. process.ts `parsed.tags.slice(0, 5)` 截断
  3. digest 路径：strike_tag 弃用，移除 strikeTagRepo 调用和 prompt 中 strike tags 字段
  4. batch-analyze：移除 strikeTagRepo，传播加 `countByRecordId >= 5` 检查
  5. records.ts 手动创建路径加 `.slice(0, 5)`
- **回归测试**：无（纯后端 AI 逻辑，需集成测试验证）
- **教训**：限制类修复必须检查所有写入路径，不能只修 API 层。应列出所有 `addToRecord` / `createMany` 调用点逐一排查
- **已提炼**：❌ 仅此例，无通用性（等出现第二次再提炼）

### [2026-04-11] [bug] 录音处理通知状态滞后
- **现象**：录音完成后日记已在时间线可见，但 FAB 胶囊仍显示"处理中"5-30 秒，等 AI 后处理完成才消失
- **根因**：`fab.tsx` 在 `asr.done` 时设置 `processing=true` 显示"处理中"胶囊，要等 `process.result` 消息才清除。但日记在 `asr.done` 时已创建可见，用户感知与系统状态不匹配
- **修复**：`asr.done` 不再设 `processing=true`，改为 `fabNotify.success("已记录")` 短暂提示；`process.result` 静默刷新时间线不弹通知；`error` case 用 `pipelineIdRef` 判断是否显示错误；移除 30s safety timeout
- **回归测试**：`features/recording/components/fab-notify-stale.test.ts` — 标注 `regression: fix-recording-notify-stale`
- **教训**：异步管线的通知粒度应与用户感知对齐——用户关心的是"我的内容保存了吗"，而非"AI 后处理完了吗"
- **已提炼**：❌ 仅此例，无通用性

### [2026-04-12] [bug] 上滑指令 CommandSheet 堵塞无响应
- **现象**：用户上滑触发指令后，长时间无响应或 CommandSheet 永远卡在"处理中"
- **根因**：三层问题叠加：(1) Layer 2 双阶段串行 AI 调用（classifyVoiceIntent + matchTodoByHint/executeVoiceAction），总耗时 5-20 秒；(2) AI 返回空 actions 时 process.result 无 todo_commands，CommandSheet phase 永远停在 "processing"；(3) 上滑松手后到 CommandSheet 打开前无视觉反馈
- **修复**：(1) 新建 commandFullMode 单阶段模式，预加载待办+目标+文件夹上下文，单次 AI 调用替代双阶段串行，支持待办/日记/搜索/文件夹四类工具，预期 2-5 秒；(2) app/page.tsx process.result handler 兜底空结果和错误，CommandSheet 新增 empty/error phase + 20 秒超时保护；(3) 上滑松手后 fabNotify.info("指令处理中...")
- **回归测试**：`gateway/src/handlers/command-full-mode.test.ts`（13 个）+ `gateway/src/handlers/command-full-prompt.test.ts`（9 个）+ `features/todos/components/command-sheet.test.tsx`（8 个）— 标注 `regression: fix-command-sheet-stuck`
- **教训**：多阶段串行 AI 调用应尽量合并为单阶段含上下文的调用。上下文越完整，后处理越少，总耗时越低。
- **已提炼**：❌ 仅此例（等出现第二次再提炼）

### [2026-04-12] [bug] 提醒功能未生效 — Agent工具+编辑页+recalc
- **现象**：闹钟、日历、提前通知等提醒功能实际均未生效，AI Agent 工具也无法设置提醒
- **根因**：三个集成断点：(1) Agent 工具 create_todo/update_todo 的 schema 缺少 reminder_before、reminder_types 参数，AI 无法设置提醒；(2) update_todo handler 修改 scheduled_start 后未触发 recalcReminderAt，已有提醒时间不同步；(3) todo-edit-sheet 完全没有提醒设置 UI
- **修复**：(1) create_todo/update_todo schema 添加 reminder_before + reminder_types，handler 添加 reminder_at 计算和 recalc 逻辑（含 scheduled_start=null 时清除 reminder_at）；(2) todo-edit-sheet 添加提醒选项（不提醒/5分/15分/30分/1小时前），清除 date 时自动重置 reminderBefore；(3) 对抗审查发现的3个边界问题均已修复
- **回归测试**：`gateway/src/tools/definitions/create-todo.test.ts`（5个）+ `gateway/src/tools/definitions/update-todo.test.ts`（6个）+ `features/todos/components/todo-edit-sheet.test.tsx`（5个）— 标注 `regression: fix-reminder-not-working`
- **教训**：Agent 工具 schema 必须与 REST API 参数保持同步。当 REST 路由支持某个参数但工具不支持时，AI 等于缺了一只手。新增 DB 字段时应同时检查所有写入路径（REST + 工具 + 前端）
- **已提炼**：❌ 首次出现

### [2026-04-13] [bug] domain 字段全面废弃 — 双重分类体系清理
- **现象**：侧边栏杂乱，wiki page 和 domain 双体系并存，AI prompt 同时收到 domain 和 page title 造成分类混乱
- **根因**：domain 字段是旧分类体系残留。fix-sidebar-wiki-mgmt 废弃了 domain 工具但未清理 domain 字段的读写路径（6处写入+12处读取+2个废弃函数）。wiki-compiler prompt 同时传 existingDomains 和 allPageIndex，AI 在两套分类间摇摆
- **修复**：(1) 停止全部 6 处 domain 写入（lightweight-classifier、at-route-parser、wiki-compiler、routes/todos）；(2) 清理 prompt 中的 existingDomains 和 domainHint；(3) getDimensionSummary 重写为 JOIN wiki_page.title 分组；(4) search 工具 domain 过滤改为 wiki_page.title 匹配（精确优先+ILIKE 回退+通配符转义）；(5) 类型定义移除 domain 字段
- **回归测试**：wiki-compile-prompt.test.ts + wiki-compiler-links.test.ts + lightweight-classifier.test.ts + at-route-parser.test.ts + wiki-page.test.ts — 全部同步更新
- **教训**：废弃一个字段必须彻底——停工具不够，必须同时停字段读写路径。残留的读取路径会让 AI 和用户产生"这个字段还有效"的错觉
- **已提炼**：❌ 首次出现

### [2026-04-13] [bug] Goal/Wiki Page 数据清洗 — 存量脏数据一次性迁移
- **现象**：侧边栏充斥重复目标、空壳页面、孤儿 goal，所有 goal page 平铺在 L3 顶层不分层级
- **根因**：旧 goal_sync 无去重（fix-goal-quality 已修复增量逻辑）；goal page 硬编码 level=3 parent_id=NULL；domain 工具创建的 page 与 classifier 创建的重复
- **修复**：SQL 迁移 067_goal_wiki_data_cleanup.sql，7 步：(1)重复 goal todo 合并 (2)重复 goal page 合并 (3)孤儿 todo 修复 (4)孤儿 page 修复 (5)空壳清理 (6)过期 suggested 清理 (7)embedding/pg_trgm 匹配重挂载
- **回归测试**：goal-cleanup-logic.test.ts（55 个测试）
- **教训**：数据迁移 PL/pgSQL 中 SELECT INTO 的变量类型必须与查询结果匹配——SELECT 多列 INTO 单个变量时必须用 RECORD 类型，不能用 UUID
- **已提炼**：❌ 首次出现

### [2026-04-13] [流程改进] 侧边栏显示优化 — Topic/Goal 分区
- **现象**：侧边栏 topic page 和 goal page 混排，空 page 占位，goal 全在顶层不分层
- **根因**：侧边栏渲染逻辑未按 page_type 分区，排序仅用 level+updatedAt 不考虑活跃度
- **修复**：(1) 前端分为「主题」区和「目标」区；(2) 空 page opacity 弱化+快捷归档；(3) 排序改为 recordCount DESC；(4) goal 在 topic 子树中带 ⭐ 标记
- **教训**：排序优化时注意前端是否有 hardcoded 的分组判断文本（如"其他"），后端改动后端的 fallback 文本要保持一致
- **已提炼**：❌ 首次出现
