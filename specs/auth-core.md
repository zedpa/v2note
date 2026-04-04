---
id: "054a"
title: "Auth — Token & Session"
status: active
domain: auth
dependencies: []
superseded_by: null
related: ["auth-ux.md"]
created: 2026-03-23
updated: 2026-04-04
---

# Auth — Token & Session (认证后端安全层)

> 拆分自：auth.md（原 054）

## 概述

用户反馈两类问题：
1. 登录后过一会被踢出，需要重新输入账号密码
2. 昨天注册的账号今天登录失败，重新注册又可以

根因是 auth 系统存在多个层面的脆弱性：token 竞态、生命周期过短、无记忆凭据、注册无事务保护、device_id 身份混淆。

---

## 1. Token Management (Token 管理)

> 来源：auth-hardening Phase 1

### 问题诊断

**根因：Refresh Token 竞态消耗**

Access token 15 分钟过期后，多个并发 API 请求同时 401，各自触发 refresh。
服务端 refresh token 是一次性的（用后即删），第二个 refresh 请求到达时 token 已不存在，返回 401，前端调用 `logout("token_expired")`。

```
请求 A: 401 → refresh(token_abc) → ✅ 成功，删除 token_abc，发新 token_xyz
请求 B: 401 → refresh(token_abc) → ❌ token_abc 已删除 → "revoked" 401
→ logout() → 用户被踢出
```

代码位置：
- `shared/lib/api.ts:91-103` — `tryRefreshToken()` 无锁，可并发调用
- `gateway/src/routes/auth.ts:131` — `deleteByHash` 即刻删除，无宽容窗口

**加剧因素：Access token 15 分钟太短**
- 用户放下手机吃个饭就过期
- 每 15 分钟必然触发至少一次 refresh
- 网络慢时更容易并发

### 修复方案

#### Fix 1：前端 Refresh Token 加锁（关键） <!-- ✅ completed -->

```typescript
// shared/lib/api.ts
let _refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  // 复用正在进行的 refresh，防止并发
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = doRefresh();
  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

async function doRefresh(): Promise<boolean> {
  try {
    const auth = await getAuth();
    const rt = auth.getRefreshTokenValue();
    if (!rt) return false;
    const { refreshToken } = await import("./api/auth");
    const result = await refreshToken(rt);
    await auth.updateTokens(result.accessToken, result.refreshToken);
    return true;
  } catch {
    return false;
  }
}
```

#### Fix 2：Access Token 延长到 2 小时 <!-- ✅ completed -->

```typescript
// gateway/src/auth/jwt.ts
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "2h" });  // 原来是 "15m"
}
```

B2C 产品标准做法。15m 适合金融场景，对笔记/效率工具太激进。

#### Fix 3：主动续期（token 快过期时后台静默 refresh） <!-- ✅ completed -->

```typescript
// shared/lib/api.ts — 每次请求前检查 token 剩余时间
async function ensureFreshToken(): Promise<void> {
  const token = (await getAuth()).getAccessToken();
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiresIn = payload.exp * 1000 - Date.now();
    if (expiresIn < 10 * 60 * 1000) { // 剩余 <10 分钟
      await tryRefreshToken(); // 后台静默刷新
    }
  } catch { /* token 解析失败，等 401 再处理 */ }
}
```

在 `request()` 函数开头调用 `await ensureFreshToken()`，用户无感知续期。

### 场景

#### 场景 1.1：并发 401 不导致登出 <!-- ✅ completed -->
```
假设 (Given)  用户已登录，access token 刚过期
当   (When)   3 个 API 请求同时返回 401
那么 (Then)   只发出 1 次 refresh 请求
并且 (And)    3 个请求都用新 token 重试成功
并且 (And)    用户无感知
```

#### 场景 1.2：主动续期 <!-- ✅ completed -->
```
假设 (Given)  用户已登录 1 小时 50 分钟（access token 剩余 10 分钟）
当   (When)   用户发起任意 API 请求
那么 (Then)   先后台静默 refresh，再发实际请求
并且 (And)    用户无感知，不经历 401
```

#### 场景 1.3：2 小时内不需要 refresh <!-- ✅ completed -->
```
假设 (Given)  用户登录后正常使用
当   (When)   1.5 小时后发起请求
那么 (Then)   access token 仍有效，直接成功
并且 (And)    不触发 refresh 流程
```

### 边界条件
- [x] refresh 进行中又来新的 401 → 等同一个 Promise
- [ ] refresh 失败后立即又有 401 → 不应无限重试，直接 logout
- [ ] 多 tab 页面 → localStorage 变更跨 tab 同步（storage event）
- [ ] 主动续期 + 被动 401 refresh 同时触发 → 加锁保证只发一次
- [ ] token 解析失败（格式异常）→ 跳过主动续期，等 401 兜底

---

## 2. Session Lifecycle (会话生命周期)

> 来源：auth-session

### 概述
完善认证生命周期：前端登出时调用后端 API 撤销 refresh token，防止 token 泄漏；token 过期时静默刷新；多设备登出互踢。

### 现状问题
1. `POST /api/v1/auth/logout` 后端已实现（auth.ts:143），但前端退出仅清除本地 token
2. Refresh token 在数据库中持续有效，即使用户"退出登录"
3. 无 token 过期的前端处理策略

### 场景

#### 场景 2.1: 正常登出 <!-- ✅ completed -->
```
假设 (Given)  用户已登录
当   (When)   用户点击侧边栏"退出登录"按钮
那么 (Then)   调用 POST /api/v1/auth/logout（携带 refreshToken）
并且 (And)    后端删除该 refresh token 记录
并且 (And)    前端清除 localStorage 中的 accessToken + refreshToken + deviceId
并且 (And)    跳转到登录页面
```

#### 场景 2.2: 登出网络失败 <!-- ✅ completed -->
```
假设 (Given)  用户已登录但网络不可用
当   (When)   用户点击"退出登录"
那么 (Then)   前端仍清除本地 token 并跳转登录页
并且 (And)    后端 refresh token 自然过期（30 天 TTL 兜底）
```

#### 场景 2.3: Access token 过期静默刷新 <!-- ✅ completed -->
```
假设 (Given)  用户的 accessToken 已过期，refreshToken 仍有效
当   (When)   任意 API 请求返回 401
那么 (Then)   自动调用 POST /api/v1/auth/refresh
并且 (And)    用新 accessToken 重试原始请求
并且 (And)    用户无感知
```

#### 场景 2.4: Refresh token 也过期 <!-- ✅ completed -->
```
假设 (Given)  用户的 refreshToken 已过期
当   (When)   任意 API 请求返回 401 且刷新也失败
那么 (Then)   清除本地 token
并且 (And)    跳转到登录页
并且 (And)    显示提示"登录已过期，请重新登录"
```

#### 场景 2.5: 登出确认弹窗 <!-- ✅ completed -->
```
假设 (Given)  用户有未同步的本地数据
当   (When)   用户点击"退出登录"
那么 (Then)   显示确认弹窗："退出后未同步的数据将丢失，确定退出？"
并且 (And)    确认后执行场景 2.1
```

### 接口约定

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

### 边界条件
- [ ] 多次快速点击退出按钮（防抖）
- [ ] 退出过程中网络恢复（不中断退出流程）
- [x] 并发多个 401 请求时的刷新竞态（只发一次 refresh，其他排队等待）— 已在 Token Management 解决

---

## 3. Email Verification System (邮箱验证系统)

> 来源：邮箱认证需求 2026-04-04
> 邮件服务：Resend（免费额度 100 封/天）

### 数据库变更

```sql
-- 迁移: xxx_email_auth.sql

-- 1. app_user 表增加 email 字段，phone 改为可选
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_email ON app_user(email) WHERE email IS NOT NULL;
ALTER TABLE app_user ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE app_user ADD CONSTRAINT chk_user_identity
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- 2. 验证码表
CREATE TABLE IF NOT EXISTS email_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'register',  -- register | bind | reset_password
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_verification_email ON email_verification(email, used, expires_at);
```

### 约束说明

- `phone` 从 `NOT NULL` 改为可选，但通过 `CHECK` 约束确保 phone 和 email 至少有一个
- `email` 加 partial unique index（NULL 不参与唯一约束）
- 原有 `phone UNIQUE` 约束保留不变

### Resend 集成

```typescript
// gateway/src/auth/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  await resend.emails.send({
    from: "念念有路 <noreply@你的域名.com>",
    to: email,
    subject: "您的验证码",
    html: `<p>您的验证码是 <strong>${code}</strong>，5 分钟内有效。</p>`,
  });
}
```

### 接口约定

#### POST /api/v1/auth/send-email-code

发送 6 位验证码到邮箱。

```typescript
// Request
{ email: string, purpose: "register" | "bind" | "reset_password" }

// Response 200
{ ok: true, expiresIn: 300 }  // 5 分钟

// Error 400: 邮箱格式无效
// Error 409: purpose=register 但邮箱已注册
// Error 429: 60 秒内重复发送 / 超过小时限额
```

**后端逻辑：**
1. 校验邮箱格式（服务端正则）
2. 如果 purpose=register，检查邮箱是否已注册 → 409
3. 如果 purpose=reset_password，检查邮箱是否存在 → 404（不泄漏，统一返回 200）
4. 检查该邮箱最近 60 秒内是否有未过期的验证码 → 429
5. 检查该 IP 1 小时内发送次数 → 超过 10 次返回 429
6. 生成 6 位随机数字码，存入 `email_verification` 表（expires_at = now() + 5min）
7. 通过 Resend 发送邮件
8. 返回 200

#### POST /api/v1/auth/verify-email-code

校验验证码。

```typescript
// Request
{ email: string, code: string, purpose: "register" | "bind" | "reset_password" }

// Response 200
{ ok: true, verificationToken: string }  // 一次性 token，10 分钟有效，用于后续操作

// Error 400: 验证码错误
// Error 410: 验证码过期
// Error 429: 尝试次数超过 3 次
```

**后端逻辑：**
1. 查找该邮箱 + purpose 最近的未使用、未过期验证码
2. 不存在 → 410（过期或不存在）
3. attempts >= 3 → 429（标记 used=true，该码作废）
4. code 不匹配 → attempts+1，返回 400（附带剩余次数）
5. code 匹配 → used=true，签发一次性 verificationToken（JWT，payload: { email, purpose }，10 分钟有效）

#### POST /api/v1/auth/register — 扩展

```typescript
// 新增请求格式（邮箱注册）
{
  email: string,
  verificationToken: string,  // verify-email-code 返回的 token
  password: string,
  displayName?: string,
  deviceId: string
}

// 原有手机号注册格式保持不变
{ phone: string, password: string, displayName?: string, deviceId: string }
```

**后端逻辑：**
- 检测请求中有 email 还是 phone，分支处理
- 邮箱注册：验证 verificationToken 有效且 purpose=register，提取 email
- 创建用户：email 填入，phone 为 NULL
- 其余流程（设备绑定、token 签发）不变

#### POST /api/v1/auth/login — 扩展

```typescript
// 新增请求格式（邮箱登录）
{ email: string, password: string, deviceId: string }

// 原有格式保持不变
{ phone: string, password: string, deviceId: string }
```

**后端逻辑：**
- 检测请求中有 email 还是 phone
- 邮箱：`SELECT * FROM app_user WHERE email = $1`
- 手机号：保持不变
- 密码验证、token 签发逻辑不变

### 场景

#### 场景 3.1：发送邮箱验证码
```
假设 (Given)  用户输入邮箱 test@example.com，purpose=register
并且 (And)    该邮箱未注册
当   (When)   调用 POST /auth/send-email-code
那么 (Then)   生成 6 位数字验证码
并且 (And)    存入 email_verification 表（expires_at = now+5min）
并且 (And)    通过 Resend 发送邮件
并且 (And)    返回 { ok: true, expiresIn: 300 }
```

#### 场景 3.2：60 秒内重复发送
```
假设 (Given)  30 秒前已向 test@example.com 发送过验证码
当   (When)   再次调用 POST /auth/send-email-code
那么 (Then)   返回 429，附带剩余等待秒数
并且 (And)    不发送邮件
```

#### 场景 3.3：验证码校验成功
```
假设 (Given)  test@example.com 的验证码为 "123456"，未过期
当   (When)   调用 POST /auth/verify-email-code { email, code: "123456", purpose: "register" }
那么 (Then)   标记该验证码 used=true
并且 (And)    返回 verificationToken（JWT，10 分钟有效）
```

#### 场景 3.4：验证码输入错误
```
假设 (Given)  test@example.com 的验证码为 "123456"，attempts=0
当   (When)   调用 verify-email-code { code: "000000" }
那么 (Then)   attempts 增加到 1
并且 (And)    返回 400 { error: "验证码错误", remainingAttempts: 2 }
```

#### 场景 3.5：验证码 3 次失败后作废
```
假设 (Given)  test@example.com 的验证码 attempts=2
当   (When)   第 3 次输入错误验证码
那么 (Then)   标记 used=true（作废）
并且 (And)    返回 429 "验证码已失效，请重新获取"
```

#### 场景 3.6：验证码过期
```
假设 (Given)  验证码已超过 5 分钟
当   (When)   调用 verify-email-code
那么 (Then)   返回 410 "验证码已过期"
```

#### 场景 3.7：邮箱注册
```
假设 (Given)  用户持有有效的 verificationToken（purpose=register，email=test@example.com）
当   (When)   调用 POST /auth/register { email, verificationToken, password, deviceId }
那么 (Then)   创建 app_user（email=test@example.com, phone=NULL）
并且 (And)    绑定设备、签发 access+refresh token
并且 (And)    返回 201
```

#### 场景 3.8：邮箱登录
```
假设 (Given)  用户 test@example.com 已注册
当   (When)   调用 POST /auth/login { email: "test@example.com", password, deviceId }
那么 (Then)   验证密码
并且 (And)    签发 token，返回 200
```

#### 场景 3.9：IP 频率限制
```
假设 (Given)  同一 IP 1 小时内已发送 10 次验证码
当   (When)   再次调用 send-email-code
那么 (Then)   返回 429 "请求过于频繁，请稍后再试"
```

### 边界条件
- [ ] 邮箱大小写：存储和查询时统一转 lowercase
- [ ] verificationToken 被重复使用 → 第二次注册应失败（token 一次性）
- [ ] 并发发送：同一邮箱同时请求两次 → 只有一个成功（利用 60 秒限制）
- [ ] Resend 发送失败 → 返回 500，不存验证码（或存了但标记发送失败）
- [ ] 注册时 verificationToken 中的 email 与请求 body 中的 email 不一致 → 拒绝
- [ ] 既没有 phone 也没有 email 的请求 → 400
- [ ] 旧用户全部有 phone，迁移后 CHECK 约束自然满足

---

## 4. Password Reset (忘记密码)

> 通过邮箱验证码重置密码

### 接口约定

#### POST /api/v1/auth/reset-password

```typescript
// Request
{
  email: string,
  verificationToken: string,  // verify-email-code 返回的，purpose=reset_password
  newPassword: string
}

// Response 200
{ ok: true }

// Error 400: 密码不满足要求（<6位）
// Error 401: verificationToken 无效或过期
// Error 404: 邮箱未注册
```

**后端逻辑：**
1. 验证 verificationToken（purpose 必须是 reset_password）
2. 根据 email 查找用户 → 不存在返回 404
3. 校验 newPassword >= 6 位
4. bcrypt hash 新密码，更新 app_user.password_hash
5. 删除该用户所有 refresh_token（强制重新登录所有设备）
6. 返回 200

### 场景

#### 场景 4.1：正常重置密码
```
假设 (Given)  用户 test@example.com 已注册
并且 (And)    持有有效的 verificationToken（purpose=reset_password）
当   (When)   调用 POST /auth/reset-password { email, verificationToken, newPassword: "NewPass123" }
那么 (Then)   密码更新为 NewPass123 的 bcrypt hash
并且 (And)    该用户所有 refresh_token 被删除
并且 (And)    返回 200
```

#### 场景 4.2：重置后旧密码失效
```
假设 (Given)  用户刚重置密码为 "NewPass123"
当   (When)   用旧密码登录
那么 (Then)   登录失败 401
当   (When)   用 "NewPass123" 登录
那么 (Then)   登录成功
```

#### 场景 4.3：重置后其他设备被踢出
```
假设 (Given)  用户在设备 A 和设备 B 同时登录
当   (When)   在设备 A 重置密码
那么 (Then)   设备 B 的 refresh token 失效
并且 (And)    设备 B 下次请求时被踢出到登录页
```

#### 场景 4.4：仅邮箱用户可重置（当前阶段）
```
假设 (Given)  用户仅有手机号，未绑定邮箱
当   (When)   尝试通过邮箱重置密码
那么 (Then)   send-email-code 返回 200（不泄漏用户是否存在）
并且 (And)    实际不发送邮件
注：手机号用户的密码重置需等短信验证码接入（远期）
```

### 边界条件
- [ ] 新密码和旧密码相同 → 允许（不做限制）
- [ ] 重置过程中用户在另一设备登录 → 新 token 照常签发，重置完成后被踢
- [ ] 密码重置不影响 email_verification 表中的记录（已被 verify 标记 used）

---

## 5. Account Binding (账户绑定)

> 已有手机号用户绑定邮箱 / 已有邮箱用户绑定手机号（预留）

### 接口约定

#### POST /api/v1/auth/bind-email

```typescript
// Request（需要 Authorization header）
{
  email: string,
  verificationToken: string  // verify-email-code 返回的，purpose=bind
}

// Response 200
{ ok: true, user: { id, phone, email, displayName } }

// Error 401: 未登录
// Error 409: 该邮箱已被其他用户绑定
// Error 400: verificationToken 无效
```

**后端逻辑：**
1. 从 JWT 获取当前用户 userId
2. 验证 verificationToken（purpose=bind）
3. 检查该 email 是否已被其他用户使用 → 409
4. `UPDATE app_user SET email = $1 WHERE id = $2`
5. 返回更新后的用户信息

#### POST /api/v1/auth/bind-phone（预留，暂不实现）

```typescript
// 需要短信验证码能力，等 SMS 接入后实现
{ phone: string, smsVerificationToken: string }
```

### 场景

#### 场景 5.1：手机号用户绑定邮箱
```
假设 (Given)  用户通过手机号注册（email 为 NULL）
并且 (And)    已通过邮箱验证获得 verificationToken（purpose=bind）
当   (When)   调用 POST /auth/bind-email { email: "user@example.com", verificationToken }
那么 (Then)   app_user.email 更新为 "user@example.com"
并且 (And)    用户后续可用邮箱或手机号登录
```

#### 场景 5.2：邮箱已被占用
```
假设 (Given)  other@example.com 已被另一用户注册
当   (When)   当前用户尝试绑定 other@example.com
那么 (Then)   返回 409 "该邮箱已被其他账户使用"
```

#### 场景 5.3：用户已有邮箱，再次绑定
```
假设 (Given)  用户已绑定 old@example.com
当   (When)   用户尝试绑定 new@example.com
那么 (Then)   覆盖为 new@example.com（需先验证新邮箱）
```

### 边界条件
- [ ] 绑定邮箱后，记住账号功能保存的 lastPhone 不受影响
- [ ] 绑定邮箱后立即可用邮箱登录
- [ ] 并发绑定同一邮箱（两个用户同时操作）→ 只有一个成功（DB unique 约束）

---

## 依赖
- shared/lib/storage.ts — 跨平台存储（已有）
- gateway/src/db/pool.ts — 事务支持（需要 client-level query）
- `POST /api/v1/auth/logout` — ✅ 后端已实现
- `POST /api/v1/auth/refresh` — ✅ 后端已实现
- resend — 邮件发送服务（新增依赖）
- `RESEND_API_KEY` — 环境变量（新增）

## 关键文件
- `gateway/src/routes/auth.ts` — 后端 logout/refresh/register 路由
- `gateway/src/auth/jwt.ts` — JWT 签发
- `gateway/src/auth/email.ts` — Resend 邮件发送（新增）
- `gateway/src/db/repositories/email-verification.ts` — 验证码仓库（新增）
- `shared/lib/api.ts` — API 基础客户端（拦截器）
- `features/auth/hooks/use-auth.ts` — 前端 auth 状态管理
