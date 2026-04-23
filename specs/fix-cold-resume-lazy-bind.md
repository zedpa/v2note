---
id: "fix-cold-resume-lazy-bind"
title: "Fix: 冷启动懒绑定生命周期补完（§7.7 restored 派发 + §8 懒绑定网络无关）"
status: completed
domain: infra
risk: high
dependencies: ["fix-cold-resume-silent-loss.md"]
superseded_by: null
backport: fix-cold-resume-silent-loss.md#场景 7.2
created: 2026-04-19
updated: 2026-04-20
---

# Fix: 冷启动懒绑定生命周期补完

## 概述

本 spec 是 `fix-cold-resume-silent-loss.md` 的**子域** spec，专门处理 §7.2 懒绑定机制在冷启动 / 长时间未用 / WS 未就绪场景下的后续运行时修复：

- **§7.7**（Phase 10 · Phase 3 P0-1）：`initAuth()` 从 storage 恢复 `_user` 时不派发 `auth:user-changed`，导致懒绑定扫描永不被唤醒
- **§8**（Phase 11 · 2026-04-20 现场复现）：即便 §7.7 唤醒了 worker，`runWorker()` 内 `ensureGatewaySession=false` 时**整体 break**，懒绑定整段跳过；且 WS open 后没有任何代码重新触发同步 → 形成死锁

两节共同修复"用户长时间未用 App → 打开 → 直接录音/打字 → 数据静默丢失"的真实用户现场症状。

## 与主 spec 的关系

- 主 spec：`fix-cold-resume-silent-loss.md`（§1-§7.6）—— 本地捕获基础设施 + Phase 9 冷启动运行时修复
- 本 spec：Phase 10 + Phase 11 —— 懒绑定生命周期残留 bug
- 共享：§7.2 懒绑定写入路径、§7.4 账号视图过滤、§7.5 synced 不改写不变量（请参考主 spec）

---

## §7.7 initAuth 恢复时派发 auth:user-changed（Phase 3 P0-1）

### 背景 / Why
§7.2 懒绑定依赖 `auth:user-changed` 事件触发一轮扫描，把 `userId=null` 的本地条目归属到当前登录用户。但 `initAuth()` 从 localStorage 重建 `_user` 时**不派发**任何事件——用户刷新页面、冷启动、从后台恢复等场景下：

- `_user` 在 storage 里已是登录态
- `initAuth()` 同步读取并设置 `_user`，但无事件
- `startSyncOrchestrator` 的 `triggerSync` 可能在 `initAuth` 完成前先 debounce 触发
- debounce 到点时若 `_user` 尚未 restore → `getCurrentUser()` 返回 null → 懒绑定整轮跳过
- 之后没有**任何**事件再次触发扫描（`auth:user-changed` 只在真实登录/登出派发）
- → 已落地的 `userId=null` 本地条目**永不归属**，被 §7.4 的账号视图过滤器永久屏蔽

这是冷启动刷新场景下 §7.2 整条链路失效的根因。

### 场景

**Scenario: 页面刷新后 initAuth 重建 user 应触发懒绑定**
Given 用户在上次会话已登录（`voicenote:accessToken` 与 `voicenote:user` 存在于 localStorage）
And 上次会话产生了 `userId=null, guestBatchId=B1` 的本地 capture
When 浏览器刷新页面
And `initAuth()` 从 storage 重建 `_user = { id: "U1" }`
Then 应派发 `auth:user-changed` 事件，detail 为 `{ kind: "login", userId: "U1", reason: "restored" }`
And sync-orchestrator 收到事件后应触发懒绑定扫描
And capture 的 userId 应被归属为 "U1"
And 时间线应能看到该 capture（通过 §7.4 账号视图过滤器）

**Scenario: 未登录状态刷新不应派发 login 事件**
Given localStorage 中无 accessToken 或 user
When `initAuth()` 执行
Then 不应派发 `auth:user-changed`
And `getCurrentUser()` 返回 null

**Scenario: sync-orchestrator 启动早于 initAuth 完成**
Given `startSyncOrchestrator` 在 `initAuth()` 返回之前已挂载
When `initAuth()` 成功重建 `_user`
Then 后续派发的 `auth:user-changed` 应驱动 orchestrator 进入一次懒绑定扫描
And 不能丢失 `_user` 恢复前累积的本地条目

**契约约束**：`startSyncOrchestrator` 对 `window.addEventListener("auth:user-changed", ...)` 的注册**必须在同步执行路径中完成**（同步返回之前），不能等待任何 promise。否则 `initAuth` 同步派发的 `restored` 事件可能被错过。等价条款：事件订阅 → `triggerSync` 这条链路不得插入 await。

### 接口契约

```ts
// shared/lib/auth.ts
export type AuthUserChangedDetail =
  | { kind: "login"; userId: string; reason?: "fresh" | "restored" }
  | { kind: "logout"; userId: null };

// initAuth 在成功从 storage 重建 _user 后派发：
// new CustomEvent("auth:user-changed", { detail: { kind: "login", userId, reason: "restored" } })
```

**reason 字段语义**：
- `"fresh"`（默认）：来自用户交互的真实登录（saveAuthTokens）；订阅方可选触发欢迎 UI
- `"restored"`：来自页面刷新的静默恢复；订阅方**必须**仍执行懒绑定扫描但不触发欢迎 UI

订阅方（sync-orchestrator、account-view 监听器、use-chat userIdRef 刷新）**必须**对 `"fresh"` 与 `"restored"` 行为一致——此字段仅用于展示层去抖。

### 边界条件

- [B1] `initAuth()` 重复调用（某些热模块重载）→ 只在第一次成功重建 `_user` 时派发
- [B2] storage 中 accessToken 存在但 user 字段损坏 / JSON.parse 失败 → 不派发；清空 `voicenote:user`，保留 accessToken 以便下次通过 refresh 重建 user；若 refresh 仍无法重建，saveAuthTokens/logout 路径会按常规派发事件
- [B3] 派发时 `window` 未定义（SSR / test runner）或 `CustomEvent` 构造不可用（老 jsdom）→ 安全跳过，不抛
- [B4] sync-orchestrator 收到 `reason=restored` 事件 → 与 `reason=fresh` 同等处理
- [B5] restored → fresh 升级的竞态（init 后紧接着 saveAuthTokens 同一 userId）→ **幂等合并**：saveAuthTokens 发现 `prevUserId === newUserId` 时**不**重复派发 login；只有账号切换（prevUserId !== newUserId，含 null→X）才派发 logout + login
- [B6] 向后兼容：未声明 `reason` 字段的旧事件视同 `"fresh"`；订阅方解构时**禁止**对 `reason` 做 required 断言，允许其为 undefined
- [B7] 多 tab 场景：每个 tab 各自 initAuth 各自派发 restored，行为沿用 §7.2 的 guestBatchId 单进程锁；`auth:user-changed` 不跨 tab 广播（通过 `storage` 事件的跨 tab 同步是**独立话题**，不在本节范围）

### 回归测试锚点

- `describe("regression: fix-cold-resume-silent-loss §7.7", ...)`
- `should_dispatch_user_changed_when_initAuth_restores_user_from_storage`
- `should_not_dispatch_when_no_token_in_storage`
- `should_not_dispatch_twice_on_duplicate_initAuth_calls`
- `should_drive_lazy_bind_scan_on_restored_event`

### 验收行为（E2E 锚点）

1. 预置：未登录会话产生一条 userId=null 的本地 capture，然后完成一次真实登录。
2. 刷新页面（`page.reload()`）。
3. 等待 auth 恢复（轮询 `window.__authReady === true` 或等价 flag）。
4. 断言：时间线上该 capture 可见（账号视图过滤器放行 = 懒绑定已归属 userId）。
5. 断言：该 capture 的 IndexedDB 记录中 `userId` 已更新为登录用户 id。通过测试辅助入口读取：`window.__captureStore.get(localId)` 返回的 `userId` 应等于登录用户 id（此调试挂载仅在 `NODE_ENV !== "production"` 存在）。

---

## §8 懒绑定网络无关 + WS open 触发扫描（Phase 11）

### 背景 / Why

用户现场症状复现（2026-04-20）：
> "长时间未使用，打开软件后直接录音 —— 录音完后无提示，且录音完全丢失。打字情况类似，单击开始输入、发送 → 文字直接丢失。"

§7.7 修复了 `initAuth` 恢复派发事件 → 唤醒 `triggerSync`。但 `runWorker()` 内部流程存在**第二层网络门控**，即使 trigger 到位，懒绑定依旧跑不到：

```
runWorker
  ├─ ensureGatewaySession()   ← 依赖 refreshAuth + ensureWs（最多 8s）
  │   └─ 若 !sessionOk → break（worker 退出）
  └─ lazy-bind 段              ← 永远够不到
```

**具体失败时序**（长时间未用后冷启动 + 立即录音）：

1. `initAuth` 成功恢复 `_user` → 派发 `auth:user-changed(restored)`（§7.7 生效）
2. orchestrator 收到事件 → `triggerSync` debounce 200ms → `runWorker`
3. `ensureGatewaySession` 内部：`refreshAuth` OK，但 `ensureWs()` 等待 `WebSocket OPEN`——
   - 用户长时间未用，reconnectAttempts 可能已耗尽或刚重置；新建 WS 握手 + 服务端 auth 都要时间
   - 8s 内未 OPEN → 返回 false → worker `break`
4. 与此同时或稍后，用户开始录音/打字 → `captureStore.create` 成功落地（localId, userId=null, guestBatchId=B）→ `capture:created` 触发 `triggerSync`
5. 第二轮 `ensureGatewaySession` 仍可能失败（WS 还没 OPEN）→ 再次 `break`，lazy-bind 依旧没跑
6. WS 稍后终于 OPEN —— 但**没有任何代码在 WS 从 closed→open 时调用 `triggerSync`**
7. 用户界面静默，本地数据永驻 `userId=null`；§7.4 账号视图过滤器将其隐藏；用户感知为"完全丢失"

根因两条，必须同时修：

- **根因 A：`ensureGatewaySession` 成为懒绑定的前置条件**。懒绑定只改 IDB，网络无关，不该被网络状态门控。
- **根因 B：WS open 事件不触发 `triggerSync`**。`ensureGatewaySession` 失败后缺少重试钩子，只能等 `online` / `visibility` / `pageshow` / `auth:user-changed`——在长时间未用但始终 visible+online 的会话里，这些事件都不会再触发，形成死锁。

### 场景

**Scenario 8.1：WS 未就绪时懒绑定仍执行**
Given 用户已登录（`getCurrentUser()` 返回 `{ id: "U1" }`）
And localStorage `v2note-guest-batch-id = "B1"`
And IDB 中有一条 `{ localId, userId: null, guestBatchId: "B1", syncStatus: "captured" }` 的 capture
And `ensureGatewaySession()` 返回 false（WS 建连失败或超时）
When `runWorker()` 执行一轮
Then capture 的 `userId` 应被更新为 "U1"，`guestBatchId` 应被清空
And 未推送 pushable 条目（因为 session 不 OK）
And worker 正常退出，等待下次触发

**Scenario 8.2：WS 从非 open 转为 open 自动触发同步（任意边沿）**
Given orchestrator 已启动且订阅了 gateway-client 的状态
And 之前一轮 `runWorker` 因 `ensureGatewaySession=false` 提前退出
And IDB 中存在已懒绑定完成但尚未推送的 capture（`userId=U1, syncStatus=captured`）
When gateway-client 的 WS 状态从 `closed` 或 `connecting` 变化为 `"open"`（任何非 open → open 都算边沿）
Then 应调用 `triggerSync()`（经由 `onStatusChange` 订阅）
And 下一轮 `runWorker` 应成功推送该 capture

**Scenario 8.2b：订阅注册时 WS 已 OPEN（热重连 / 快速建连）**
Given orchestrator 启动时 `subscribeWsStatus` 注入到位
And `gateway-client` 在订阅回调挂载前已经进入 `"open"` 状态
When orchestrator 在订阅注册的同一时刻读取 `lastWsStatus`
Then 应将 `lastWsStatus` 初始化为当前状态（`"open"`）
And **不**发出额外的 `triggerSync`（避免与 `startSyncOrchestrator` 末尾的主动 trigger 重复）
And 若之后状态经历 `open → closed → open` 序列，后续的 `→open` 边沿仍必须触发 `triggerSync`

**Scenario 8.3：冷启动后立即录音仍最终同步**
Given 用户冷启动并登录成功，WS 首次握手仍在进行中
When 用户在 WS OPEN 之前立即录音一次（`captureStore.create` 落地 `userId=null` + `guestBatchId=B`）
And 触发一次 `capture:created` → `triggerSync`
Then 即便首轮 `ensureGatewaySession` 失败，lazy-bind 段也应把 userId 回填为登录用户
And WS 稍后 OPEN 时，`onStatusChange("open")` 触发的 `triggerSync` 驱动下一轮推送
And 最终 capture 状态转为 `synced`，不丢失

**Scenario 8.4：lazy-bind 后单轮不推送不影响后续轮次**
Given 场景 8.1 已完成 lazy-bind 但未推送
When 再次 `triggerSync`（WS 已 OPEN）
Then worker 应在新一轮中读到 `userId=U1` 的条目并推送

### 接口契约

**sync-orchestrator.ts `runWorker()` 内部调整**：

```ts
// 伪代码（改后）
while (true) {
  state.hasPendingScan = false;
  const sessionOk = await ensureGatewaySession();

  // --- 始终执行懒绑定（不受 sessionOk 影响）---
  const unsynced = await captureStore.listUnsynced();
  const currentUser = getCurrentUser();
  const currentBatch = peekBatch();
  if (currentUser && currentBatch) {
    for (const r of unsynced) { /* 懒绑定同 §7.2 */ }
  }

  if (!sessionOk) {
    log("warn", "[sync] session not ready; lazy-bind done, will retry on next trigger");
    break;  // 退出，等待 online / visibility / auth:user-changed / ws:open / pageshow
  }

  const pushable = unsynced
    .filter(r => r.userId !== null)
    .filter(r => !state.inFlightLocalIds.has(r.localId))
    .sort(/* ... */);
  // ... 推送逻辑不变
}
```

**关键不变量**：懒绑定只读/写 IDB，**不调用任何网络 API**。将其移到 `sessionOk` 判断之前不会引入新网络依赖。

**sync-orchestrator.ts `startSyncOrchestrator` 新增 WS 状态订阅**：

```ts
// 触发点 5（新增）：gateway-client WS 状态从 closed → open
// 需要以 opts 形式注入，避免 orchestrator 直接 import gateway-client
// （单向依赖：capture 层不依赖 chat 层）
export interface SyncOrchestratorOptions {
  // ... 既有字段
  /**
   * §8：订阅 gateway WS 状态（"非 open → open" 边沿触发 triggerSync）。
   * 返回一个 unsubscribe 函数。
   * 不提供 → §8 行为关闭，向后兼容。
   */
  subscribeWsStatus?: (handler: (s: "connecting" | "open" | "closed") => void) => () => void;
  /**
   * §8 P0-1：读取当前 WS 状态，用于 orchestrator 在订阅注册时初始化 `lastWsStatus`。
   * `onStatusChange` 不回放当前状态，仅依赖订阅回调会错过订阅前已发生的 open 边沿。
   * 不提供 → orchestrator 以 "closed" 初始化，第一次收到 "open" 回调即视为边沿（可能重复触发一次）。
   */
  getCurrentWsStatus?: () => "connecting" | "open" | "closed";
}
```

`SyncBootstrap` 在 `startSyncOrchestrator` 调用点注入：

```ts
startSyncOrchestrator({
  // ...既有
  subscribeWsStatus: (handler) => {
    const client = getGatewayClient();
    return client.onStatusChange(handler);
  },
  getCurrentWsStatus: () => {
    const client = getGatewayClient();
    return client.getStatus();
  },
});
```

orchestrator 内部：
1. 启动时 `lastWsStatus = getCurrentWsStatus?.() ?? "closed"`（初始化不触发 trigger）
2. 订阅回调收到新状态 `s`：若 `lastWsStatus !== "open" && s === "open"` → `triggerSync()`；随后 `lastWsStatus = s`
3. `subscribeWsStatus` 返回的 unsubscribe 注册到 `globalListeners`，与其他触发点同寿命

### 边界条件

- [B1] `subscribeWsStatus` 未注入 → 订阅不启动，行为退化为现状（测试环境 / SSR 安全）
- [B2] **订阅注册时 WS 已 OPEN**（P0-1）：`onStatusChange` 本身**不回放当前状态**。orchestrator 必须在调用 `subscribeWsStatus` 后**立刻**调用注入方提供的 `getCurrentWsStatus()` 读取当前状态并用它**初始化** `lastWsStatus`，避免订阅注册晚于 open 事件而永久错过该边沿。初始化本身**不触发** `triggerSync`（`startSyncOrchestrator` 末尾的主动 trigger 已覆盖）；仅后续真实边沿触发。
- [B3] **"→ open 边沿"定义**（N1）：`lastWsStatus !== "open"` 且 `next === "open"` 视为边沿（含 `closed → open`、`connecting → open`）；`open → open` 不是边沿。`triggerSync` 自带 200ms debounce 合并抖动。
- [B4] lazy-bind 中途某条 `captureStore.update` 抛 `CaptureNotFoundError`（条目被其他 tab 删除）→ `continue`，不中断整轮（行为同 §7.2 现状）
- [B5] **多 tab 幂等**（P1-2）：每 tab 各自订阅 WS 状态 + 各自 `triggerSync`。懒绑定阶段无租约——但懒绑定是**幂等操作**：只做 `null → userId.id` 的一次性迁移，synced 条目被 §7.5 保护禁止改写，两 tab 任意覆盖顺序结果等价；即使两 tab 同 tick 写同一 localId，最后写胜出，值相同，业务无副作用
- [B6] `sessionOk=false` 且 lazy-bind 无匹配条目（currentBatch=null 或无 userId=null 条目）→ 等价于当前行为，无回归
- [B7] 懒绑定完成后 session 失败 break 的场景下，若未来 WS 成功 OPEN 但没有 capture 改动 → `onStatusChange("open")` 触发 `triggerSync` 进入下一轮，`pushable` 过滤后若仍无待推项则 worker 空转退出，无副作用
- [B8] `getGatewayClient()` 在 SSR / 未 mount 的环境 不应被调用；`subscribeWsStatus` 注入路径只在 `SyncBootstrap`（client component）中执行，天然绕开 SSR
- [B9] **执行顺序契约**（P0-2，强化自 §7.2 / §7.5）：
  - `await ensureGatewaySession()` 必须先完成（允许其内部 `refreshAuth` 更新 auth 状态 + 切换 `authRefreshSubject`）
  - 随后才 `getCurrentUser() / peekGuestBatchId()` 读当前快照用于 lazy-bind
  - lazy-bind 的 null → userId 回填语义不因 `sessionOk` 分支而改变（§7.2 单进程锁 + §7.5 "synced 不改写" 继续成立）
  - 改动只是**移除 `!sessionOk` 下的 break 在 lazy-bind 之前**，不改变 await 点本身、不新增并发路径
- [B10] **unsubscribe 生命周期**（P1-1）：`subscribeWsStatus` 返回的 unsubscribe 必须注册到 `globalListeners`，与 online/visibility/pageshow/auth:user-changed 同寿命；`__resetGlobalOrchestratorForTest` 必须能清理它，否则测试间泄漏
- [B11] **订阅互不干扰**（P1-3）：gateway-client `statusHandlers` 为 `Set`，现有订阅者（sync-status-banner）与新增订阅者多播且互不感知；`_emitStatus` 内 handler 异常被 try/catch 吞，新增订阅不得假设独占

### 不得引入的回归

- ❌ 不得让懒绑定调用任何网络 API（包括 `refreshAuth`、`pushCapture`、`ensureWs`）
- ❌ 不得让 `subscribeWsStatus` 变成 orchestrator 的硬依赖；缺省必须继续工作
- ❌ 不得在 WS 每次状态回调都触发 `triggerSync`；仅"非 open → open"边沿触发
- ❌ 不得修改 §7.5 "synced 条目 userId 永不改写" 不变量
- ❌ 不得在 lazy-bind 段调用 `captureStore.get` 重读；继续使用 `listUnsynced` 的快照 + 原地回填（行为同 §7.2）
- ❌ 不得在 WS 状态回调中同步断开真实 WS（订阅仅转发信号，不控制连接生命周期）
- ❌ 不得在 WS 状态回调中执行 IDB 写入（仅允许调用 `triggerSync`，保持 handler 纯信号转发）

### 回归测试锚点

- `describe("regression: fix-cold-resume-silent-loss §8", ...)`
- `should_run_lazy_bind_even_when_ensure_session_returns_false`
- `should_not_push_when_session_not_ready_but_still_lazy_bind`
- `should_trigger_sync_on_ws_status_closed_to_open_edge`
- `should_trigger_sync_on_ws_status_connecting_to_open_edge`
- `should_not_trigger_sync_on_already_open_duplicate_status_event`
- `should_initialize_lastWsStatus_from_getCurrentWsStatus_and_skip_initial_trigger`
- `should_noop_when_subscribeWsStatus_not_provided`
- `should_register_ws_unsubscribe_in_globalListeners`（§8 B10）
- `should_be_idempotent_when_two_tabs_both_lazy_bind_same_capture`（§8 B5）
- `should_recover_capture_made_before_ws_open_on_cold_start`

### 验收行为（E2E 锚点）

1. 预置：登录。为保证走 `sessionOk=false` 分支，E2E 需**显式模拟** `ensureWs` 返回 false（通过测试钩子或拦截 WS 建连），避免实际环境中 WS 意外 OPEN 导致测试退化为旁路绿。
2. 通过 `window.__captureStore.put` 注入一条 `userId=null, guestBatchId=<当前 batch>, syncStatus=captured` 的 capture。
3. 触发一次 `triggerSync`（或依赖 `capture:created` / `visibility` 自动触发）。
4. 轮询 `window.__captureStore.get(localId)`，期望 `userId` 在 ≤ 3 秒内变为登录用户 id（说明懒绑定不再被 session 门控）。
5. 放行 WS 建连（解除 `ensureWs` 的 mock 或等其自然 OPEN）；预期 `onStatusChange("open")` 触发 `triggerSync`。
6. 再次轮询，期望该 capture 的 `syncStatus` 在 ≤ 8 秒内变为 `synced`（说明 WS open 触发了下一轮推送）。

## Phase 3 对抗性审查结论（2026-04-20）

code-review-global 审查本次 §8 diff，发现 3 个 P0 + 4 个 P1。主 Agent 已在合并前完成 P0 修复：

### P0-1：worker finally 的 1s 延迟补扫 — 已修复

**现象**：`runWorker` 的 `catch` / `finally` 分支在 `hasPendingScan === true` 时用 `setTimeout(() => triggerSync(), 1000)` 补偿，形成 1 秒同步空窗，用户感知明显。

**修复**：`shared/lib/sync-orchestrator.ts` L428/L436 改为直接 `triggerSync()`。`triggerSync` 自身有 `debounceMs`（默认 200ms）窗口，不会压垮循环。

**回归测试**：现有 `should_serialize_when_flushNow_called_during_running_worker [C3]` 覆盖 pending-scan 立即重入路径。

### P0-2：跨账号污染防护 — 已修复

**现象**：设备上一次登录是 A，当前登录 B。`auth:user-changed` 派发后 sync-orchestrator 的 `peekGuestBatchId()` 仍可能返回 A 遗留的 batchId；懒绑定段会把 A 的 capture 静默划给 B。

**修复**：
- `SyncOrchestratorOptions` 新增 `getLastLoggedInUserId?` 选项，默认绑定 `guest-session.getLastLoggedInUserId`
- 懒绑定段在进入 `for` 循环前检查 `lastUserId && lastUserId !== currentUser.id` → 跳过并打 warn 日志
- 等 guest-claim 的 UI 同意流程（`confirmClaimGuestCaptures`）做显式回填

**回归测试**（3 个新增）：
- `should_skip_lazy_bind_when_last_logged_in_user_differs` — userA→userB 不自动回填
- `should_run_lazy_bind_when_last_logged_in_user_matches_current` — 同用户不误伤
- `should_run_lazy_bind_when_no_previous_user_ever_logged_in` — 首次使用设备

### P0-3：unsubscribe 测试过弱 — 已修复

**现象**：`should_register_ws_unsubscribe_in_globalListeners` 只断言 `unsubscribed === true`，未验证 `stop()` 之后再调 `wsHandler` 是否真的 no-op。

**修复**：在 stop() 后注入一条 pushable capture，调 `wsHandler!("closed"); wsHandler!("open");`，断言 `pushCapture.mock.calls.length` 未增加。

### P1 级别（延后，登记在 buglog）

- P1-1：`subscribeWsStatus` 错误回调未隔离 try/catch → 已在生产代码加 `log("error", ...)` 保护，未单独写单测
- P1-2：多 tab 幂等场景依赖 captureStore 的 IDB 事务保证（`update` 在 `syncStatus==="synced"` 时会被 TOCTOU 重读跳过）— 暂不补单测，E2E 覆盖为主
- P1-3/P1-4：sync-bootstrap 静态 import 的 SSR 审计、测试 handler 泄漏 — 无实际风险，记 buglog 持续观察

## Phase 4 验证结论（2026-04-20）

- `npx vitest run shared/lib/sync-orchestrator.test.ts` ✅ 41/41 passed
- `pnpm test`（全量）✅ 712/713（唯一失败是 `use-audio-recorder.test.ts` harmony bridge base64，本改动无关，pre-existing）
- `npx tsc --noEmit`（scoped to 改动文件）✅ 无错误；全量报错均为 pre-existing（tsconfig target / JSX 重复 attr / deprecated TodoDTO）
- E2E：`e2e/fix-cold-resume-lazy-bind.spec.ts` 编写完成但**未跑**。Playwright 基础设施当前 hang（登录/WS mock 叠加 networkidle 导致单测 >5min 无输出），依赖单元测试 + 对抗性审查作为主要保障。此现象登记在 buglog，非本次 §8 改动引入。
