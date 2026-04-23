---
id: "fix-oss-image-traffic-storm"
title: "Fix: OSS 图片流量风暴（签名不复用 + 僵尸轮询）"
status: completed
domain: infra
risk: high
dependencies: ["attachment-persistence.md"]
superseded_by: null
backport: attachment-persistence.md#P1-7
created: 2026-04-19
updated: 2026-04-20
---

# Fix: OSS 图片流量风暴

## Bug 现象

**观测窗口**：2026-04-11 ~ 2026-04-19（最严重是 4/12-4/13 前后）
**阿里云 OSS 统计**：单日流出 43 GB，读取 4.2 万次；同期写入 < 100 次。读写比 ≈ 420:1。

**数据库实证**（2026-04-19 抓取）：
- 全库 719 条 record，**只有 7 条带 `file_url`**，全部是 `source=image`（6 张）或 `manual` 文件（1 张），不含真正音频（`audio_path` 全为 null）
- 这 7 个文件全部是 4/10-4/12 上传，4/13 起新增 `file_url = 0`（与 OSS 写入<100 吻合）
- `status IN ('uploading','processing')` 的僵尸 record 16 条，最老从 2026-03-31 起未更新

**算术复核**：42000 读 / 7 文件 ≈ 6000 次/图 · 1 MB/图 ≈ 43 GB。完美闭合。

## 复现条件

1. 用户 A 库中有 ≥ 1 条 `status='uploading'` 的僵尸 record（触发轮询永不停）
2. 用户 A 库中有 ≥ 1 条带图片 `file_url` 的 record
3. 用户 A 打开时间线页面并停留

结果：前端每 5 秒拉一次 `/api/v1/records`，后端给每个 image URL 都重新签名（query 带 `Signature`/`Expires`，每次都不同），浏览器认为是新 URL → 绕过 HTTP 缓存 → `<img>` 每 5 秒重新从 OSS 拉整张图。

## 根因链

| # | 位置 | 问题 |
|---|------|------|
| 1 | `gateway/src/routes/records.ts:117-135` | 列表接口对每条 record 的 `file_url` 都调用 `getSignedUrl()`，每次签出的 URL 的 query 不同 |
| 2 | `gateway/src/storage/oss.ts:97-105` | `signatureUrl(key, { expires: 3600 })` 不带 `process` 或稳定参数 → 浏览器看作新 URL |
| 3 | `features/notes/hooks/use-notes.ts:16,117` | 固定 5 秒轮询；终止条件依赖"没有 processing/uploading"——僵尸记录导致轮询永不停 |
| 4 | 无后台任务 | 僵尸 `uploading` record 无超时兜底，最老存活 ≥ 20 天 |
| 5 | `features/notes/components/notes-timeline.tsx:750,933` | `<img src={note.file_url}>` 直接绑定签名 URL，URL 一变就重新下载 |

## 修复方案

采用 **「本地缓存 + 稳定签名 + 拔掉轮询 + 清扫僵尸」** 四层防护：

1. **浏览器端图片本地缓存**（真正的根治，也是离线可见的关键）
   - 复用既有 IndexedDB 基建（参见 `shared/lib/capture-store.ts` / `features/recording/lib/audio-cache.ts` / `features/chat/lib/chat-cache.ts` 的模式），新增 `v2note-image-cache` DB
   - 对每条带图片的 record，第一次展示时从 `file_url` fetch 并把 Blob 存入 IndexedDB，key = `record_id`（服务端稳定主键，绝不随签名变化）
   - 后续渲染：先 IndexedDB get → hit → `URL.createObjectURL(blob)` 展示；miss → fetch 并写入；用完 `revokeObjectURL`
   - 离线场景（`navigator.onLine === false` 或 fetch 失败）：只走 IndexedDB 不发网络；命中就展示，miss 才显示占位
   - 该层独立于签名 URL 是否稳定——即使签名永远变化，本地命中后不再 fetch
2. **稳定的图片 URL**（作为 cache miss 路径的二次防护，让 HTTP 缓存也能生效）
   - **首选**：签名 URL 使用 Redis 缓存（key=object_path，value=signed_url+expires_at），跨 gateway 实例共享；过期前 5 分钟刷新；同一对象在 TTL 内返回同一签名字符串
   - **次选（需独立评估）**：image bucket 改公开读 + 原始 URL —— ⚠️ **该路径涉及数据/安全模型变更**，必须先审计 image bucket 中是否含用户隐私图（截图/手写/证件），确认"不含隐私"后再采纳；否则坚持签名 + Redis 缓存方案
   - 进程内缓存（Map）仅在确认 gateway 单实例部署时才可用；PM2 cluster / 多容器场景必须用 Redis
3. **僵尸 record 超时清扫**
   - 每 10 分钟一次：`UPDATE record SET status='failed' WHERE status IN ('uploading','processing') AND updated_at < now() - INTERVAL '30 minutes'`
   - 单条 UPDATE 即由 Postgres 行锁保证幂等，多实例并发不会重复清扫
   - 已有的 14+2 条历史僵尸一次性 backfill（独立 migration）
4. **前端轮询加死线**
   - 最多轮询 `POLL_MAX_MS`（默认 10 分钟 = 120 轮 × 5s）后强制停止；达到上限后显示"自动刷新已暂停，下拉刷新恢复"
   - 用户下拉刷新或页面从不可见变为可见时，重置轮询计数
   - 页面不可见时跳过本轮轮询请求（基于 Page Visibility API）
   - `POLL_MAX_MS` 与 `POLL_INTERVAL` 通过 env 注入，测试模式可覆写为秒级

## 场景

### 场景 1: 用户浏览带图列表，图片不应被反复下载

```
假设 (Given)  用户有 3 条带图片附件的日记
当   (When)   用户打开时间线并停留一段时间
那么 (Then)   每张图片只加载一次
并且 (And)    列表在后台自动刷新时，图片无闪烁、无重新加载
```

### 场景 2: 图片地址在多次刷新中保持稳定

```
假设 (Given)  用户时间线上有若干图片日记
当   (When)   用户在短时间内反复下拉刷新列表
那么 (Then)   同一张图片的显示瞬时无感，和首次加载完全一致
并且 (And)    不会出现图片反复重载的闪动
```

### 场景 3: 卡住的上传，用户能看到明确的失败反馈

```
假设 (Given)  用户之前有一条上传很久未完成的日记（客户端崩溃 / 网络中断遗留）
当   (When)   用户打开时间线
那么 (Then)   该条日记在一段时间内会被标记为"上传失败"并展示重试入口
并且 (And)    页面不会因这条卡住的日记永远保持在"处理中"的忙碌状态
```

### 场景 4: 长时间停留不会产生持续后台流量

```
假设 (Given)  用户打开时间线后离开电脑 1 小时未操作
当   (When)   自动刷新累计达到上限
那么 (Then)   前端停止自动刷新，并在页面顶部提示"自动刷新已暂停，下拉可恢复"
并且 (And)    用户下拉刷新或回到页面前台时，自动刷新立即恢复
```

### 场景 5: 切到后台 Tab 不再消耗流量

```
假设 (Given)  用户打开时间线，然后切换到其他 Tab 工作
当   (When)   用户切换到其他 Tab 使页面处于不可见状态
那么 (Then)   自动刷新暂停，期间不产生网络请求
并且 (And)    用户切回该 Tab 时，列表立即刷新一次并恢复正常节奏
```

### 场景 6: 无卡住记录时，不触发持续轮询

```
假设 (Given)  用户库中所有日记都已处于稳定状态（无"处理中"/"上传中"）
当   (When)   用户打开时间线
那么 (Then)   前端加载一次列表后不再自动刷新
并且 (And)    用户手动下拉时才会拉取新数据
```

### 场景 7: 图片只下载一次，跨刷新、跨会话保留

```
假设 (Given)  用户时间线上有若干图片日记
当   (When)   用户第一次打开时间线并看到图片
那么 (Then)   图片原始字节被保存到本地（复用既有 IndexedDB 机制）
并且 (And)    用户刷新页面或关闭后重新打开 App，图片立即可见，不再发起图片网络请求
并且 (And)    即使服务器下发的图片 URL 发生变化（签名轮换），也不会触发重新下载
```

### 场景 8: 离线状态下图片仍可见

```
假设 (Given)  用户曾经在线浏览过某条图片日记
当   (When)   用户处于断网状态再次打开时间线
那么 (Then)   该图片仍能正常显示（从本地缓存读取）
并且 (And)    从未浏览过的图片显示占位图（图片区域不崩溃、不撑掉布局）
并且 (And)    恢复网络后，未命中缓存的图片在下一次展示时补下载并入库
```

## 验收行为（E2E 锚点）

> 用户视角操作路径，用于独立的 Playwright 验收测试。E2E 必须在实现代码之前生成。

> **测试参数注入**：测试模式下通过 env 覆写 `POLL_INTERVAL_MS=1000`、`POLL_MAX_MS=10000`、`STALE_SWEEP_MS=5000`、`STALE_THRESHOLD_MS=3000`，把 E2E 时长压缩到秒级。

### 行为 1: 连续停留图片不重复下载

1. 准备：测试账号有 1 条带图片附件的日记
2. 用户打开时间线
3. 在测试压缩窗口（约 10 秒）内等待，期间前端触发 ≥ 3 次列表刷新
4. 使用 Playwright `page.on('request')` 统计图片资源域名下的 GET 请求
5. 断言：该图片的网络请求次数 = **恰好 1 次**

### 行为 2: 图片 URL 在多次列表请求中保持稳定

1. 准备：测试账号有 1 张图片日记
2. 用户打开时间线，记录图片 `<img>` 元素的 `src` 属性
3. 等待一次自动刷新（测试模式 1s），再次读取 `src`
4. 断言：两次 `src` 字符串完全一致

### 行为 3: 卡住的上传会被标记失败

1. 准备：预置 1 条 `status='uploading'`、`updated_at` 早于 `STALE_THRESHOLD_MS` 的 record
2. 用户打开时间线
3. 在压缩窗口（≤ 2 × STALE_SWEEP_MS）内等待
4. 断言：页面上该条目显示"上传失败"文案与重试入口

### 行为 4: 达到自动刷新上限后停止

1. 用户打开时间线（压缩窗口 `POLL_MAX_MS = 10s`）
2. 使用 Playwright 记录对 `/api/v1/records` 的请求次数
3. 等待 20 秒
4. 断言：请求次数 ≤ `POLL_MAX_MS / POLL_INTERVAL_MS + 1`（默认 ≤ 11）
5. 页面应显示"自动刷新已暂停"提示

### 行为 5: 页面切后台暂停自动刷新

1. 用户打开时间线
2. Playwright `context.newPage()` 打开新页并 `bringToFront()`，使原页不可见
3. 保持 `2 × POLL_INTERVAL_MS` 时长
4. 在此期间统计原页对 `/api/v1/records` 的请求次数 = **0**
5. 切回原页（`page.bringToFront()`）
6. 断言：切回后 ≤ `POLL_INTERVAL_MS` 内触发一次请求

### 行为 6: 图片本地缓存 — 跨页面刷新仅下载 1 次

1. 准备：测试账号有 1 条带图片附件的 record
2. 用户打开时间线，等待图片元素可见
3. 记录图片资源域名（aliyuncs/oss 路径）的 GET 次数 = 1
4. `page.reload()` 重新加载页面
5. 再等图片元素可见
6. 断言：图片资源 GET 累计仍然 = 1（来自本地缓存的 blob URL 命中）

### 行为 7: 离线仍能看到已浏览过的图片

1. 前置：行为 6 前两步执行完，图片已被本地缓存
2. `context.setOffline(true)` 切到离线
3. `page.reload()`
4. 断言：图片元素仍可见，且 `naturalWidth > 0`
5. 断言：无对 OSS 域名的网络请求（已离线，不允许挂起的请求）

## 边界条件

- [ ] 签名 URL 命中缓存时过期：过期前 5 分钟提前刷新，避免用户看到 403
- [ ] 用户同时开多个 Tab：轮询上限每 Tab 独立计数，各自停止；Redis 签名缓存跨 Tab 复用
- [ ] 僵尸清扫误伤：仅清扫 `updated_at > 30 min` 的，正常上传（≤ 30 秒）不会被误 kill
- [ ] 清扫任务并发：单条 UPDATE 由 Postgres 行锁保证幂等，无需显式 SELECT FOR UPDATE
- [ ] 多 gateway 实例：清扫 cron 可在任意实例触发，幂等；签名缓存必须走 Redis，不走进程内 Map
- [ ] OSS 未配置（本地/测试环境）：不触发签名逻辑，直接返回 `file_url`
- [ ] image URL 为 `data:` 前缀（OSS 未配置降级）：不签名，直接透传
- [ ] 历史数据 backfill：一次性把现有 16 条僵尸全部置 failed
- [ ] 真正的音频录音（未来启用）：签名策略同样适用
- [ ] 轮询达到上限后的用户恢复路径：下拉刷新重置计数，页面从不可见到可见时重置计数
- [ ] **image bucket 公开读改造（若采纳次选方案）**：必须先由人工审计 image 目录前 50 样本，确认无隐私图，并同步更新 `attachment-persistence.md` P1-7 的"可见性约定"
- [ ] 本地缓存命中键：必须用 `record_id`（服务端稳定主键），**禁止**用 `file_url`（会随签名轮换）；也不用 object_path（未来换 bucket 结构会失效）
- [ ] 本地缓存大小上限：参考 `audio-cache.ts` 的 50MB 阈值，超过时按 LRU 清理最老条目（保证不把用户磁盘吃爆）
- [ ] data: URL 图片（OSS 未配置降级场景）：直接用 data URL 展示，不进入 IndexedDB（data URL 本身是自包含字节，没必要再落一份）
- [ ] Object URL 泄漏：组件卸载 / src 切换时必须 `URL.revokeObjectURL()`
- [ ] fetch 失败 + 本地无缓存 → 显示占位；不 throw，不使列表卡住
- [ ] 多 Tab 并发首次下载同一张图：允许重复 fetch（浏览器会走 HTTP 缓存合并），但写入 IndexedDB 用 `put`（upsert 语义，不会冲突）
- [ ] 用户切换账号：IndexedDB `v2note-image-cache` 以 record_id 为键，登出不自动清；登录态变更时通过账号级的"退出清理"入口统一处理（跟随既有 capture-store 行为约束）

## 接口约定

### 前端：本地图片缓存（新增）

```typescript
// shared/lib/image-cache.ts
// 复用 v2note 既有 IndexedDB 模式（见 capture-store.ts / audio-cache.ts / chat-cache.ts）
// DB: v2note-image-cache  store: images  keyPath: recordId
export interface CachedImage {
  recordId: string;       // 主键，使用服务端 record.id
  blob: Blob;             // 原始字节
  contentType: string;    // image/jpeg | image/png | ...
  byteLength: number;     // 用于 LRU / 统计
  lastAccessedAt: string; // ISO 8601，LRU 清理使用
  createdAt: string;
}

export async function getCachedImage(recordId: string): Promise<CachedImage | null>;
export async function putCachedImage(recordId: string, blob: Blob): Promise<void>;
export async function pruneOldest(targetBytes: number): Promise<number>; // 返回清理条数
export async function getTotalBytes(): Promise<number>;
```

```typescript
// features/notes/hooks/use-cached-image.ts
// 组件调用：const src = useCachedImage(recordId, fileUrl)
// 返回：blob URL（命中/miss 下载后）或 null（加载中/失败）
export function useCachedImage(recordId: string, fileUrl: string | null): string | null;
```

> 规则：
> 1. `fileUrl` 以 `data:` 开头 → 直接返回 `fileUrl`，不走缓存。
> 2. 缓存命中：返回 `URL.createObjectURL(blob)`，并异步更新 `lastAccessedAt`。
> 3. 缓存 miss：`fetch(fileUrl)` → 取 `response.blob()` → `putCachedImage(recordId, blob)` → 返回 object URL。
> 4. `navigator.onLine === false` 且 miss → 返回 `null`（上层展示占位）。
> 5. 组件卸载时调用 `URL.revokeObjectURL()` 避免内存泄漏。

### 后端：签名 URL 缓存（Redis）

```typescript
// gateway/src/storage/oss.ts
// Redis key: `oss:sig:{object_path}`，value: signed_url
// Redis TTL = 签名有效期 - 5 分钟 buffer（例：签名 1 小时 → Redis 55 分钟）
// 读取：先 GET Redis；miss → 调用 OSS SDK 签名 → SETEX 写回
// 同一 object_path 在 Redis TTL 内返回完全相同的 URL 字符串 → 浏览器 HTTP 缓存生效
export async function getSignedUrl(objectPath: string): Promise<string>
```

> 进程内 Map 缓存在多实例下会导致 URL 字符串漂移，HTTP 缓存失效。仅当确认 `process.env.GATEWAY_INSTANCES === '1'` 时才允许走进程内 fallback。

### 后端：僵尸清扫任务

```typescript
// gateway/src/jobs/sweep-stale-records.ts
// 每 10 分钟触发一次
export async function sweepStaleRecords(): Promise<{ swept: number }> {
  // UPDATE record SET status='failed'
  // WHERE status IN ('uploading','processing')
  //   AND updated_at < now() - INTERVAL '30 minutes'
}
```

### 前端：轮询上限 + 页面可见性

```typescript
// features/notes/hooks/use-notes.ts
const POLL_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 5000;
const POLL_MAX_MS      = Number(process.env.NEXT_PUBLIC_POLL_MAX_MS)      || 600_000; // 10 分钟
const MAX_POLL_ROUNDS  = Math.ceil(POLL_MAX_MS / POLL_INTERVAL_MS);        // 默认 120

// 规则：
// 1) 达到 MAX_POLL_ROUNDS → 停止；顶部提示"自动刷新已暂停"
// 2) document.visibilityState === 'hidden' → 跳过本轮轮询（不消耗次数）
// 3) visibilitychange → visible：重置计数并立即拉一次
// 4) 下拉刷新：重置计数
```

> **E2E 关键**：`NEXT_PUBLIC_POLL_INTERVAL_MS`、`NEXT_PUBLIC_POLL_MAX_MS` 通过 env 注入，测试模式缩到秒级；`STALE_SWEEP_MS` / `STALE_THRESHOLD_MS` 同理。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `gateway/src/storage/oss.ts` | getSignedUrl 加进程内缓存（或改 image 不签名） |
| `gateway/src/routes/records.ts` | 列表接口签名逻辑对齐缓存策略 |
| `gateway/src/jobs/sweep-stale-records.ts` | **新建**：僵尸清扫任务 |
| `gateway/src/index.ts` | 注册清扫任务 cron |
| `features/notes/hooks/use-notes.ts` | 轮询加上限 + 页面可见性判定 |
| `supabase/migrations/0XX_backfill_stale_records.sql` | 一次性把历史 16 条僵尸置 failed |
| `shared/lib/image-cache.ts` | **新建**：IndexedDB v2note-image-cache 存储图片 Blob |
| `features/notes/hooks/use-cached-image.ts` | **新建**：hook 封装缓存命中/下载/离线回退 |
| `features/notes/components/notes-timeline.tsx` | `<img src={note.file_url}>` 改走 `useCachedImage` |

## 回归测试（强制留痕）

> 本次修复必须留下至少一个永久性测试用例（CLAUDE.md 要求），describe 块标注 `regression: fix-oss-image-traffic-storm`。

测试清单（`gateway/src/storage/oss.test.ts` 中的"签名缓存复用"与 `shared/lib/image-cache.test.ts` 中的"重复 get 不 fetch"均为**不可删除的回归锚**）：
- `features/notes/hooks/use-notes.test.ts` — 轮询上限 / 页面可见性 / 下拉重置计数（新增）
- `gateway/src/jobs/sweep-stale-records.test.ts` — 僵尸清扫边界（30 分钟阈值、并发幂等）（新增）
- `gateway/src/storage/oss.test.ts` — 签名缓存复用：同 object_path 在 TTL 内返回相同 URL 字符串（新增，**regression anchor**）
- `shared/lib/image-cache.test.ts` — put 后 get 命中不重复 fetch；navigator.onLine=false 时 miss 返回 null；data: URL 不落库（新增，**regression anchor**）
- `features/notes/hooks/use-cached-image.test.ts` — hook 的 hit/miss/offline 三态（新增）
- `e2e/oss-image-traffic.spec.ts` — 验收行为 1-7（新增）

## Implementation Phases

> `risk: high` → 每 Phase 开始前需用户确认。

- [ ] Phase 0: 紧急止血 — 历史 16 条僵尸 backfill 为 failed（独立 migration，可先行）
- [ ] Phase 1: 后端 Redis 签名缓存 + 僵尸清扫 cron + 测试桩接口（阻止流量继续烧钱）
- [ ] Phase 2: 前端轮询上限 + 页面可见性 + 下拉重置
- [ ] Phase 3: **前端图片本地缓存**（IndexedDB + useCachedImage + notes-timeline 接入）
- [ ] Phase 4: E2E 验收行为 1-7 + 回归测试锚
- [ ] Phase 5（可选，需独立评估）：image bucket 隐私审计 → 如通过则改公开读去除签名

## 备注

- **4/13 commit `3c39ed9 fix 录音上传` 与本 bug 无直接因果**：该 commit 只动了 fab.tsx/records.ts 的鉴权分支和 deviceId 移除，未碰签名逻辑。4/11-4/12 图片进入系统时就埋下了雷，4/13 只是统计窗口内第一个完整 24h。
- **"录音读写"的用户描述是误解**：OSS 实际存的是图片（image source），录音走实时 ASR 不落 OSS。
- 本 fix 完成后需回写 `attachment-persistence.md#P1-7` 的边界条件：附件 URL 必须缓存友好。
