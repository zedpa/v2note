---
id: fix-onboarding-old-account
title: "Fix: 老账户误触发新手引导（2问 + 点击引导）"
status: completed
domain: onboarding
risk: low
dependencies: []
backport: cold-start.md#场景 2.3.9
created: 2026-04-20
updated: 2026-04-20
---

# Fix: 老账户误触发新手引导（2问 + 点击引导）

## 概述

老账户（已完成过 onboarding 的用户）在清除 App 数据、换设备或弱网环境下打开 App 时，会再次看到新手引导流程（OnboardingSeed 名字输入 + CoachMark 点击引导）。

## 根因

`app/page.tsx` 的 onboarding 状态检测 Layer 3 有两个缺陷：

1. **用 records 数量做代理判断**：调用 `GET /api/v1/records?limit=1` 检查用户是否有历史数据。但后端有权威的 `user_profile.onboarding_done` 字段，是 onboarding handler 在用户完成引导时设置的，这才是正确的数据源。
2. **错误 fallback 方向反了**：`.catch(() => setIsFirstTime(true))` 在网络失败时默认显示 onboarding。对老用户来说，冷启动期间 gateway 慢响应或弱网就会误触发。正确的 fallback 应该是**不显示**（老用户体验远比新用户错过引导重要；新用户下次打开还会再检测）。

## 修复范围

Layer 1（新格式 localStorage key）和 Layer 2（旧格式 key 迁移）保持不变，仅替换 Layer 3 的后端兜底逻辑。

> 本修复 supersedes `fix-onboarding-old-user.md` 的 Layer 3 方案（`records?limit=1` 代理判断 + catch 显示引导）。

## 修复方案

### 1. 后端：新增 `GET /api/v1/onboarding/status` 端点

需要 auth（Bearer token），未认证返回 401。返回 `{ done: boolean }`，直接查 `user_profile.onboarding_done`。
- 无 profile 行 → `done: false`
- profile 存在但 `onboarding_done` 为 NULL → `done: false`（等同新用户）
- profile 存在且 `onboarding_done = true` → `done: true`

### 2. 前端：Layer 3 改用 onboarding/status 接口

```typescript
// 替换 GET /api/v1/records?limit=1
api.get<{ done: boolean }>("/api/v1/onboarding/status")
  .then((res) => {
    if (res?.done) {
      localStorage.setItem(key, "true");
    } else {
      setIsFirstTime(true);
    }
  })
  .catch(() => {
    // 网络失败 → 安全 fallback: 不显示引导
    // 新用户下次打开会重新检测
  });
```

注：`isFirstTime` 控制 OnboardingSeed 显示；`showGuide`（CoachMark）仅在 OnboardingSeed 的 onComplete/onSkip 中触发，所以不设 `isFirstTime=true` 就不会触发 CoachMark。

## 场景

### S1: 老用户换设备登录 — 后端确认已完成
```
假设 (Given)  老用户已完成过 onboarding（后端 onboarding_done=true），在新设备登录
当   (When)   App 检查 onboarding 状态
那么 (Then)   后端返回 done=true
并且 (And)    自动标记 localStorage，不显示 OnboardingSeed
并且 (And)    不显示 CoachMark 点击引导
```

### S2: 真正的新用户
```
假设 (Given)  新注册用户首次登录（后端无 user_profile 或 onboarding_done=false）
当   (When)   App 检查 onboarding 状态
那么 (Then)   后端返回 done=false
并且 (And)    显示 OnboardingSeed 引导流程
```

### S3: 网络失败时不误触发
```
假设 (Given)  用户 localStorage 无 onboarding key
当   (When)   App 检查 onboarding 状态，但 API 调用失败（网络错误）
那么 (Then)   不显示 OnboardingSeed
并且 (And)    不显示 CoachMark 点击引导
并且 (And)    用户正常进入主界面
```

## 验收行为（E2E 锚点）

### 行为 1: 老用户不触发引导
1. 已完成过 onboarding 的用户在无 localStorage 标记的情况下打开 App
2. App 不显示 OnboardingSeed（名字输入页面）
3. App 不显示 CoachMark（点击引导遮罩）
4. 用户直接进入主界面（时间线/待办视图）

### 行为 2: 新用户正常触发引导
1. 新注册用户首次打开 App
2. App 显示 OnboardingSeed（名字输入页面）
3. 完成或跳过后显示 CoachMark（点击引导）

## 边界条件
- [x] 老用户从未创建过 user_profile 行（极早期注册）→ findByUser 返回 null → done=false → 此时等同新用户，可接受
- [x] 老用户有 profile 行但 onboarding_done 为 NULL（字段后加）→ done=false → 等同新用户，可接受
- [x] 网络超时 → 不显示引导，下次打开重新检测
- [x] 并发调用（React StrictMode 双渲染）→ 幂等，无副作用

## 接口约定

### GET /api/v1/onboarding/status

响应：
```typescript
{ done: boolean }
```

逻辑：查 `user_profile.onboarding_done`，无记录返回 `false`。

## Implementation Phases
- [ ] Phase 1: 后端新增 GET /api/v1/onboarding/status
- [ ] Phase 2: 前端 Layer 3 改用新接口 + 修复 catch fallback
