---
id: fix-onboarding-old-user
title: "Fix: 老用户登录误触发新手引导"
status: completed
domain: onboarding
risk: low
dependencies: []
created: 2026-04-13
updated: 2026-04-13
---

# Fix: 老用户登录误触发新手引导

## 概述

引导判断仅依赖 `localStorage("v2note:onboarded:${userId}")`，老用户换设备或清数据后 key 不存在，误判为新用户触发 OnboardingSeed。

## 根因

`app/page.tsx` 中 onboarding 检查：
```typescript
const key = `v2note:onboarded:${user.id}`;
if (localStorage.getItem(key) !== "true") {
  setIsFirstTime(true); // ← 老用户也会走到这里
}
```

三种场景会触发误判：
1. 老用户换新设备 → localStorage 为空
2. 老用户清除浏览器/App 数据 → localStorage 被清
3. 代码从旧 key 格式（`v2note:onboarded`）迁移到新格式（`v2note:onboarded:${userId}`）后，旧 key 未被迁移

## 修复方案

在 localStorage 检查失败时，加两层兜底：

1. **旧 key 兼容**：检查 `localStorage("v2note:onboarded")`（旧格式），如有则迁移到新格式
2. **后端兜底**：调用 `GET /api/v1/records?limit=1` 检查用户是否有历史数据，有则标记为已引导

## 场景

### S1: 老用户换设备登录
```
假设 (Given)  老用户在新设备登录，localStorage 无 onboarding key
当   (When)   app 检查 onboarding 状态
那么 (Then)   后端查到用户有历史 records
并且 (And)    自动标记为已引导，不显示 OnboardingSeed
```

### S2: 真正的新用户
```
假设 (Given)  新注册用户首次登录
当   (When)   app 检查 onboarding 状态
那么 (Then)   后端查不到 records
并且 (And)    显示 OnboardingSeed 引导流程
```

### S3: 旧 key 格式迁移
```
假设 (Given)  老用户 localStorage 有旧格式 key "v2note:onboarded"="true"
当   (When)   app 检查 onboarding 状态
那么 (Then)   旧 key 被识别，自动迁移到新格式
并且 (And)    不显示 OnboardingSeed
```

## 验收行为（E2E 锚点）

1. 老用户登录 → 直接进入主页，不显示引导
2. 新用户注册 → 显示 OnboardingSeed

## 边界条件

- [ ] 后端 API 调用失败（网络断开）→ 安全 fallback 到显示引导（新用户体验不受损）
- [ ] localStorage 和后端同时可用 → localStorage 优先（避免不必要的网络请求）
