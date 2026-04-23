---
id: fix-device-id-cleanup
title: "Fix: deviceId 残留清理 — gateway 路由层全面切换 userId"
status: completed
backport: auth-ux-login.md
domain: infra
risk: medium
dependencies: ["fix-remove-device-id.md"]
created: 2026-04-13
updated: 2026-04-13
---

# Fix: deviceId 残留清理 — gateway 路由层全面切换 userId

## 概述

`fix-remove-device-id` 完成了 JWT/WS/Session 层的 deviceId 清理，但 gateway HTTP 路由层仍有 50+ 处调用 `getDeviceId(req)`。当前 `getDeviceId` 的 fallback 机制（返回 userId）让功能暂时可用，但存在两个隐患：
1. **写入脏数据**：`device_id` 列被写入 userId 值
2. **新代码误用**：开发者看到 `getDeviceId` 仍在使用，会继续调用它

本次修复目标：**让 `getDeviceId` 彻底退出路由层，所有路由只使用 `getUserId`。**

## 修复范围

### 1. 废弃 getDeviceId

`gateway/src/lib/http-helpers.ts` 中的 `getDeviceId()` 标记为 `@deprecated`，只保留用于 devices.ts 等极少数确实需要设备 ID 的场景。

### 2. 路由层清理（18 个文件）

所有路由处理函数中：
- 删除 `const deviceId = getDeviceId(req)` 调用
- 用 `const userId = getUserId(req)` 替代（大部分已有此调用）
- 数据查询统一走 `userId` 路径
- 写入操作中 `device_id` 字段改为 `undefined`/不传

涉及文件：
- `records.ts` — 5 处
- `todos.ts` — 2 处
- `goals.ts` — 5 处
- `skills.ts` — 6 处
- `notebooks.ts` — 4 处
- `notifications.ts` — 2 处
- `memory.ts` — 3 处
- `profile.ts` — 2 处
- `soul.ts` — 2 处
- `reviews.ts` — 2 处
- `stats.ts` — 5 处
- `export.ts` — 1 处
- `daily-loop.ts` — 4 处
- `ideas.ts` — 1 处
- `ingest.ts` — 1 处（加上写入 4 处）
- `onboarding.ts` — 1 处
- `vocabulary.ts` — 6 处
- `devices.ts` — 保留（确实操作 device 表）

### 3. 认证门控统一

所有需要认证的路由使用统一模式：
```typescript
const userId = getUserId(req);
if (!userId) { sendError(res, "Unauthorized", 401); return; }
```

替代原来的 `getDeviceId(req)`（会抛 HttpError 401）。

### 4. Repository 层兜底查询清理

以下 repository 函数有 `findByDevice` 路径，调用方已经全部走 `findByUser`，`findByDevice` 变成死代码：
- `todoRepo.findByDevice` — 可保留但标注 @deprecated
- `memoryRepo.findByDevice` — 同上

不删除这些函数（避免影响旧数据回填脚本），但标注废弃。

## 场景

### S1: 登录后加载日记列表
```
假设 (Given)  用户已登录，JWT 只含 userId
当   (When)   前端调用 GET /api/v1/records
那么 (Then)   路由使用 getUserId 获取 userId
并且 (And)    查询走 user_id 路径，返回正确数据
并且 (And)    不调用 getDeviceId
```

### S2: 创建待办
```
假设 (Given)  用户已登录
当   (When)   前端调用 POST /api/v1/todos
那么 (Then)   创建的 todo 记录中 device_id 为 null
并且 (And)    user_id 正确填充
```

### S3: 加载目标列表
```
假设 (Given)  用户已登录
当   (When)   前端调用 GET /api/v1/goals
那么 (Then)   使用 userId 查询目标
并且 (And)    不依赖 device_id
```

### S4: 文件导入创建记录
```
假设 (Given)  用户已登录
当   (When)   前端调用 POST /api/v1/ingest
那么 (Then)   创建的 record 中 device_id 为 null
并且 (And)    user_id 正确填充
```

## 验收行为（E2E 锚点）

### 行为 1: 登录后日记列表加载
用户登录后日记列表正常加载

### 行为 2: 创建待办
用户创建待办，数据库中 device_id 为 null

### 行为 3: 目标列表
用户查看目标，目标列表正常显示

### 行为 4: 录音识别
用户发送语音，录音识别和保存正常

### 行为 5: 编译通过
TypeScript 编译无错误

## 边界条件

- [ ] 旧数据（只有 device_id 没有 user_id 的记录）仍可通过兜底查询访问
- [ ] getDeviceId 标记 @deprecated 后编译无警告
- [ ] devices.ts 路由保持不变（确实操作 device 表）

## Implementation Phases

- [ ] Phase 1: 修改所有路由文件，删除 getDeviceId 调用，统一 getUserId
- [ ] Phase 2: 清理写入操作中的 device_id 字段
- [ ] Phase 3: 标记 getDeviceId 和 findByDevice 为 @deprecated
- [ ] Phase 4: TypeScript 编译验证
