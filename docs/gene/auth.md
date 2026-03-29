# gene_auth — 用户登录认证 + 多设备数据统一

## 概述

v2note 原始架构完全基于 `device_id` 隔离数据。本基因引入手机号+密码登录认证体系，实现跨设备数据统一。首次启动强制登录，无游客模式。

## 数据库

### 新增表

- `app_user` — id, phone (UNIQUE), password_hash, display_name, created_at
- `refresh_token` — user_id, token_hash (UNIQUE), device_id, expires_at

### 现有表变更

所有用户级表新增 `user_id UUID REFERENCES app_user(id)` 列 + 索引：
record, memory, soul, user_profile, goal, pending_intent, notebook, ai_diary, weekly_review, skill_config

device 表新增 `user_id` 关联列。

Migration: `supabase/migrations/014_auth.sql`

## 后端架构

### Auth 模块 (`gateway/src/auth/`)

| 文件 | 职责 |
|------|------|
| `passwords.ts` | bcryptjs hash/verify, cost=12 |
| `jwt.ts` | signAccessToken(15min), signRefreshToken(30d), verify |
| `middleware.ts` | getAuthContext(req) 解析 Bearer JWT → {userId, deviceId} |
| `link-device.ts` | linkDeviceToUser — 设置 device.user_id + UPDATE 所有历史数据 |

### Auth 路由 (`gateway/src/routes/auth.ts`)

| 端点 | 说明 |
|------|------|
| `POST /api/v1/auth/register` | 手机号+密码注册，创建用户+关联设备+回填数据+签发JWT |
| `POST /api/v1/auth/login` | 手机号+密码登录，关联设备+回填数据+签发JWT |
| `POST /api/v1/auth/refresh` | 刷新 access token（旧 refresh token 删除+签发新pair） |
| `POST /api/v1/auth/logout` | 删除 refresh token |
| `GET /api/v1/auth/me` | 返回用户信息+已关联设备列表 |

### 身份解析

- `http-helpers.ts` 的 `getDeviceId()` 优先从 JWT 提取 deviceId，fallback 到 X-Device-Id header
- CORS 添加 Authorization header 允许
- WebSocket 新增 `auth` 消息类型，认证后存入 `connectionUserMap`

### Repository 层

所有 10 个 repository 新增 `findByUser(userId)` 方法，现有 `findByDevice()` 保留不删：
memory, record, soul, user-profile, goal, todo, notebook, ai-diary, pending-intent, skill-config

soul/user-profile 额外新增 `upsertByUser(userId, content)`。

### Handler/Manager 改造

- ProcessPayload + ChatStartPayload 加 `userId?` 字段
- Session 接口加 `userId?` 字段
- context/loader `loadWarmContext` 支持 userId，有 userId 时用 user-based loader
- soul/profile manager 的 update 函数接受可选 userId，有则用 upsertByUser
- memory manager 透传 userId 到 context loader

## 前端架构

### Auth 状态 (`shared/lib/auth.ts`)

- Token 持久化到 Capacitor Preferences / localStorage
- `initAuth()` 启动时从 storage 恢复
- `saveAuthTokens()` / `updateTokens()` / `logout()`
- `isLoggedIn()` / `getAccessToken()` / `getCurrentUser()`

### API Client (`shared/lib/api.ts`)

- 有 token 时自动加 `Authorization: Bearer <token>` header
- 401 响应 → 自动 refresh token 重试一次 → 仍失败清除 auth
- auth 路由本身不触发 refresh 逻辑（`!path.includes("/auth/")` 保护）

### WebSocket (`features/chat/lib/gateway-client.ts`)

- 连接后自动发送 `{ type: "auth", payload: { token, deviceId } }`

### 登录/注册 UI (`features/auth/`)

- `hooks/use-auth.ts` — React hook 封装 login/register/logout
- `components/login-page.tsx` — 手机号+密码表单，shadcn Input + Button
- `components/register-page.tsx` — 注册表单（手机号+密码+确认密码+昵称）

### 强制登录 (`app/page.tsx`)

- useAuth hook 检查登录状态
- authLoading → 显示 loading spinner
- 未登录 → 全屏 LoginPage / RegisterPage（不渲染主界面）
- 已登录 → 正常渲染

### UI 入口

- Header: 有 displayName 时显示首字母头像，否则显示 User 图标
- Sidebar: 显示用户昵称+手机号，底部"退出登录"按钮

## 数据合并策略 (linkDeviceToUser)

当新设备登录已有账户时：
1. `UPDATE device SET user_id = ?`
2. 批量 `UPDATE` 10 张表: `SET user_id = ? WHERE device_id = ? AND user_id IS NULL`
3. soul/user_profile 单独处理（singleton per user）

## 设备注册防重（2026-03）

新设备注册存在并发重复问题：app 启动时多个组件同时调用 `getDeviceId()`，导致重复请求 + 重复创建欢迎日记。

### 修复
- **前端** `shared/lib/device.ts`：`pendingPromise` 并发锁，多组件同时调用复用同一个 Promise
- **后端** `gateway/src/db/repositories/device.ts`：`findOrCreate()` 用 `ON CONFLICT DO NOTHING` 原子操作 + `isNew` 标记
- **后端** `gateway/src/routes/devices.ts`：仅 `isNew=true` 时创建欢迎日记

## 环境变量

- `JWT_SECRET` — 必须设置，否则使用不安全的默认值 `dev-jwt-secret-change-me`

## 关键文件

**新建：**
- `supabase/migrations/014_auth.sql`
- `gateway/src/auth/passwords.ts`, `jwt.ts`, `middleware.ts`, `link-device.ts`
- `gateway/src/db/repositories/app-user.ts`, `refresh-token.ts`
- `gateway/src/routes/auth.ts`
- `shared/lib/auth.ts`, `shared/lib/api/auth.ts`
- `features/auth/components/login-page.tsx`, `register-page.tsx`
- `features/auth/hooks/use-auth.ts`
- `docs/gene/auth.md`

**修改：**
- `gateway/package.json` (bcryptjs + jsonwebtoken)
- `gateway/src/index.ts` (auth 路由 + WebSocket auth)
- `gateway/src/lib/http-helpers.ts` (JWT-aware getDeviceId)
- `gateway/src/middleware/cors.ts` (Authorization header)
- `gateway/src/db/repositories/index.ts` + 10个 repo (findByUser)
- `gateway/src/handlers/process.ts`, `chat.ts` (userId 注入)
- `gateway/src/context/loader.ts` (user-based loaders)
- `gateway/src/memory/manager.ts`, `soul/manager.ts`, `profile/manager.ts` (userId 支持)
- `gateway/src/session/manager.ts` (userId 字段)
- `shared/lib/api.ts` (Authorization + 401 refresh)
- `shared/lib/types.ts` (AuthIdentity + AppUser)
- `features/chat/lib/gateway-client.ts` (WebSocket auth)
- `app/page.tsx` (auth gate)
- `shared/components/new-header.tsx` (用户头像)
- `features/sidebar/components/sidebar-drawer.tsx` (退出登录)
