---
status: superseded
superseded_by: "auth.md"
---

# 登出与会话管理

> 状态：✅ 已完成
> 优先级：P0 — 安全隐患，refresh token 未撤销

## 概述
完善认证生命周期：前端登出时调用后端 API 撤销 refresh token，防止 token 泄漏；token 过期时静默刷新；多设备登出互踢。

## 现状问题
1. `POST /api/v1/auth/logout` 后端已实现（auth.ts:143），但前端退出仅清除本地 token
2. Refresh token 在数据库中持续有效，即使用户"退出登录"
3. 无 token 过期的前端处理策略

## 场景

### 场景 1: 正常登出
```
假设 (Given)  用户已登录
当   (When)   用户点击侧边栏"退出登录"按钮
那么 (Then)   调用 POST /api/v1/auth/logout（携带 refreshToken）
并且 (And)    后端删除该 refresh token 记录
并且 (And)    前端清除 localStorage 中的 accessToken + refreshToken + deviceId
并且 (And)    跳转到登录页面
```

### 场景 2: 登出网络失败
```
假设 (Given)  用户已登录但网络不可用
当   (When)   用户点击"退出登录"
那么 (Then)   前端仍清除本地 token 并跳转登录页
并且 (And)    后端 refresh token 自然过期（30 天 TTL 兜底）
```

### 场景 3: Access token 过期静默刷新
```
假设 (Given)  用户的 accessToken 已过期，refreshToken 仍有效
当   (When)   任意 API 请求返回 401
那么 (Then)   自动调用 POST /api/v1/auth/refresh
并且 (And)    用新 accessToken 重试原始请求
并且 (And)    用户无感知
```

### 场景 4: Refresh token 也过期
```
假设 (Given)  用户的 refreshToken 已过期
当   (When)   任意 API 请求返回 401 且刷新也失败
那么 (Then)   清除本地 token
并且 (And)    跳转到登录页
并且 (And)    显示提示"登录已过期，请重新登录"
```

### 场景 5: 登出确认弹窗
```
假设 (Given)  用户有未同步的本地数据
当   (When)   用户点击"退出登录"
那么 (Then)   显示确认弹窗："退出后未同步的数据将丢失，确定退出？"
并且 (And)    确认后执行场景 1
```

## 边界条件
- [ ] 多次快速点击退出按钮（防抖）
- [ ] 退出过程中网络恢复（不中断退出流程）
- [ ] 并发多个 401 请求时的刷新竞态（只发一次 refresh，其他排队等待）

## 接口约定

已有接口：
```typescript
// POST /api/v1/auth/logout
// Request body:
{ refreshToken: string }
// Response: { ok: true }

// POST /api/v1/auth/refresh
// Request body:
{ refreshToken: string }
// Response: { accessToken: string, refreshToken: string }
```

## 依赖
- `POST /api/v1/auth/logout` — ✅ 后端已实现
- `POST /api/v1/auth/refresh` — ✅ 后端已实现
- `shared/lib/api.ts` — 需增加 401 拦截 + 自动刷新逻辑
- `features/auth/hooks/use-auth.ts` — 需增加 logout 函数调后端

## 关键文件
- `gateway/src/routes/auth.ts` — 后端 logout/refresh 路由
- `features/auth/hooks/use-auth.ts` — 前端 auth 状态管理
- `features/sidebar/components/sidebar-drawer.tsx` — 退出按钮
- `shared/lib/api.ts` — API 基础客户端（拦截器）

## 备注
- Refresh token TTL 30 天（见 auth.ts signRefreshToken），即使前端不调 logout，也会自然过期
- 当前 shared/lib/api.ts 已有部分 refresh 逻辑，需审查是否完整
