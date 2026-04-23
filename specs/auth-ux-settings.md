---
id: "auth-ux-settings"
status: active
domain: auth
risk: medium
dependencies: ["auth-core.md", "auth-ux-login.md"]
superseded_by: null
related: ["auth-core.md", "auth-ux-login.md"]
created: 2026-04-17
updated: 2026-04-17
---

# Auth — UX (邮箱认证/用户设置/忘记密码/实施阶段)

> 拆分自：auth-ux.md（因超过 800 行触发 R7）
> 登录/注册基础体验、Device ID 废弃、注册事务保护见 [auth-ux-login.md](./auth-ux-login.md)
> Token 管理与会话生命周期见 [auth-core.md](./auth-core.md)

## 概述

本文档覆盖认证系统前端体验的进阶部分：邮箱认证 UI、用户设置页、忘记密码 UI、远期高级认证，以及整体实施阶段。

---

## 6. Email Auth UI (邮箱认证前端)

> 来源：邮箱认证需求 2026-04-04
> 后端接口见 [auth-core.md](./auth-core.md) 章节 3-5

### 6.1 登录页改造

**现有**：手机号 + 密码
**改造后**：顶部增加 Tab 切换（"手机号" | "邮箱"），默认显示上次使用的方式

```
┌─────────────────────────┐
│    ┌──────┬──────┐      │
│    │手机号│ 邮箱 │      │  ← Tab 切换
│    └──────┴──────┘      │
│                         │
│  ┌─────────────────┐    │
│  │ 邮箱地址         │    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │ 密码        👁   │    │
│  └─────────────────┘    │
│                         │
│  ☑ 自动登录             │
│                         │
│  ┌─────────────────┐    │
│  │     登  录       │    │
│  └─────────────────┘    │
│                         │
│  忘记密码？              │
│  没有账号？立即注册       │
└─────────────────────────┘
```

**邮箱正则（前端基础校验）**：`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

**记住账号扩展**：
- 手机号模式：保存 `lastPhone`（已有）
- 邮箱模式：保存 `lastEmail` 到 localStorage
- Tab 默认选中上次使用的模式（`lastLoginMethod: "phone" | "email"`）

#### 场景 6.1.1：邮箱登录
```
假设 (Given)  用户选择邮箱 Tab
当   (When)   输入 test@example.com + 密码，点击登录
那么 (Then)   调用 POST /auth/login { email, password, deviceId }
并且 (And)    登录成功后保存 lastEmail + lastLoginMethod="email"
```

#### 场景 6.1.2：Tab 切换清空状态
```
假设 (Given)  用户在手机号 Tab 输入了号码和密码
当   (When)   切换到邮箱 Tab
那么 (Then)   手机号输入框值保留（但隐藏）
并且 (And)    邮箱 Tab 显示 lastEmail（如果有）
并且 (And)    密码框清空
并且 (And)    错误消息清除
```

#### 场景 6.1.3：记住上次登录方式
```
假设 (Given)  用户上次使用邮箱登录
当   (When)   重新打开登录页
那么 (Then)   默认选中邮箱 Tab
并且 (And)    邮箱输入框预填 lastEmail
```

#### 场景 6.1.4：忘记密码入口
```
假设 (Given)  用户在邮箱 Tab
当   (When)   点击"忘记密码？"
那么 (Then)   切换到忘记密码流程（见 8. Forgot Password UI）
```

### 6.2 注册页改造

**现有**：手机号 + 密码 + 昵称
**改造后**：顶部 Tab 切换（"手机号" | "邮箱"），邮箱注册需先验证

```
邮箱注册流程（分步）：

Step 1: 输入邮箱
┌─────────────────────────┐
│  ┌─────────────────┐    │
│  │ 邮箱地址         │    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │   发送验证码      │    │
│  └─────────────────┘    │
└─────────────────────────┘

Step 2: 输入验证码（发送后显示）
┌─────────────────────────┐
│  已发送到 t***@example.com │
│  ┌──┬──┬──┬──┬──┬──┐   │
│  │  │  │  │  │  │  │   │  ← 6 位验证码输入
│  └──┴──┴──┴──┴──┴──┘   │
│  剩余 4:32              │
│  未收到？重新发送（48秒后可用）│
└─────────────────────────┘

Step 3: 设置密码 + 昵称
┌─────────────────────────┐
│  ┌─────────────────┐    │
│  │ 密码        👁   │    │
│  └─────────────────┘    │
│  ■■■□□ 中等              │
│  ┌─────────────────┐    │
│  │ 确认密码    👁   │    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │ 昵称（选填）     │    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │     注  册       │    │
│  └─────────────────┘    │
└─────────────────────────┘
```

#### 场景 6.2.1：邮箱注册 — 发送验证码
```
假设 (Given)  用户选择邮箱 Tab，输入 test@example.com
当   (When)   点击"发送验证码"
那么 (Then)   按钮变为 loading 状态
并且 (And)    调用 POST /auth/send-email-code { email, purpose: "register" }
并且 (And)    成功后进入 Step 2（验证码输入）
并且 (And)    显示 5 分钟倒计时
并且 (And)    "重新发送"按钮 60 秒后可用
```

#### 场景 6.2.2：邮箱注册 — 验证码校验
```
假设 (Given)  用户收到验证码 123456
当   (When)   输入 6 位验证码
那么 (Then)   自动调用 POST /auth/verify-email-code { email, code, purpose: "register" }
并且 (And)    成功后进入 Step 3（设密码）
并且 (And)    保存返回的 verificationToken
```

#### 场景 6.2.3：邮箱注册 — 完成注册
```
假设 (Given)  用户已验证邮箱，在 Step 3 填写密码
当   (When)   点击"注册"
那么 (Then)   调用 POST /auth/register { email, verificationToken, password, displayName, deviceId }
并且 (And)    注册成功后进入应用
```

#### 场景 6.2.4：验证码输入错误
```
假设 (Given)  用户在 Step 2
当   (When)   输入错误验证码
那么 (Then)   显示"验证码错误，还可尝试 2 次"
并且 (And)    输入框抖动 + 清空
```

#### 场景 6.2.5：验证码过期
```
假设 (Given)  5 分钟倒计时结束
当   (When)   用户输入验证码
那么 (Then)   显示"验证码已过期，请重新获取"
并且 (And)    显示"重新发送"按钮
```

#### 场景 6.2.6：手机号注册不变
```
假设 (Given)  用户选择手机号 Tab
当   (When)   填写手机号 + 密码 + 昵称，点击注册
那么 (Then)   流程与现有完全一致，无分步（手机号暂不需要验证码）
```

### 边界条件
- [ ] 邮箱输入框实时校验格式（失焦时显示错误）
- [ ] 验证码输入完 6 位后自动提交（不需要按确认）
- [ ] 验证码倒计时与 Tab 切换独立（切走再切回，倒计时继续）
- [ ] 网络中断时发送验证码失败 → 显示重试按钮
- [ ] 邮箱遮罩显示：`t***@example.com`（首字母 + *** + @后部分）

---

## 7. User Settings Page (用户设置页)

> 新增页面：用户个人信息管理

### 概述

在 app 中新增用户设置页面，入口在侧边栏用户头像/名称区域。功能包括：
- 查看并修改昵称
- 查看并修改头像
- 绑定/更换邮箱
- 查看已绑定手机号（预留绑定入口）
- 查看账户创建时间

### 页面结构

```
┌─────────────────────────┐
│  ← 用户设置              │
├─────────────────────────┤
│                         │
│      ┌──────┐           │
│      │ 头像 │  点击更换   │
│      └──────┘           │
│                         │
│  昵称     小明        >  │
│  ─────────────────────  │
│  手机号   138****0000    │
│  ─────────────────────  │
│  邮箱     未绑定     >   │  ← 点击进入绑定流程
│  ─────────────────────  │
│  注册时间  2026-03-15    │
│                         │
├─────────────────────────┤
│  退出登录                │
└─────────────────────────┘
```

### 接口约定

#### PATCH /api/v1/auth/profile

```typescript
// Request（需要 Authorization header）
{
  displayName?: string,
  avatarUrl?: string
}

// Response 200
{ user: { id, phone, email, displayName, avatarUrl, createdAt } }
```

**后端逻辑：**
1. 从 JWT 获取 userId
2. 只更新提供的字段（PATCH 语义）
3. displayName 长度限制：1-20 字符
4. avatarUrl：接受 URL 字符串（头像上传由附件系统处理，此处只存 URL）

#### app_user 表新增字段

```sql
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

### 场景

#### 场景 7.1：进入设置页
```
假设 (Given)  用户已登录
当   (When)   点击侧边栏头像/名称区域
那么 (Then)   打开用户设置页
并且 (And)    显示当前昵称、手机号（脱敏）、邮箱状态、头像、注册时间
```

#### 场景 7.2：修改昵称
```
假设 (Given)  用户在设置页
当   (When)   点击昵称行
那么 (Then)   弹出编辑弹窗，预填当前昵称
当   (When)   输入新昵称"小红"，点击确认
那么 (Then)   调用 PATCH /auth/profile { displayName: "小红" }
并且 (And)    成功后页面和侧边栏头像旁昵称同步更新
```

#### 场景 7.3：修改头像
```
假设 (Given)  用户在设置页
当   (When)   点击头像
那么 (Then)   打开图片选择器（相册/相机）
当   (When)   选择图片并裁剪
那么 (Then)   上传到附件系统获取 URL
并且 (And)    调用 PATCH /auth/profile { avatarUrl: "https://..." }
并且 (And)    成功后头像立即更新
```

#### 场景 7.4：绑定邮箱
```
假设 (Given)  用户未绑定邮箱（邮箱行显示"未绑定"）
当   (When)   点击邮箱行
那么 (Then)   进入邮箱绑定流程：
             1. 输入邮箱
             2. 发送验证码（POST /auth/send-email-code, purpose=bind）
             3. 输入验证码
             4. 验证通过 → 调用 POST /auth/bind-email
             5. 绑定成功 → 返回设置页，显示已绑定邮箱
```

#### 场景 7.5：更换已绑定邮箱
```
假设 (Given)  用户已绑定 old@example.com
当   (When)   点击邮箱行
那么 (Then)   显示当前邮箱 + "更换"按钮
当   (When)   点击更换
那么 (Then)   进入绑定流程（同 7.4），新邮箱覆盖旧邮箱
```

#### 场景 7.6：手机号显示（只读，预留）
```
假设 (Given)  用户有手机号
当   (When)   查看设置页
那么 (Then)   手机号显示为脱敏格式（138****0000）
并且 (And)    不可编辑（等 SMS 接入后开放绑定/更换）

假设 (Given)  用户是邮箱注册（无手机号）
当   (When)   查看设置页
那么 (Then)   手机号行显示"未绑定"（灰色，不可点击，预留）
```

#### 场景 7.7：退出登录入口
```
假设 (Given)  用户在设置页
当   (When)   点击底部"退出登录"
那么 (Then)   执行现有退出流程（同 auth-core 场景 2.1）
```

### 边界条件
- [ ] 昵称为空字符串或全空格 → 不允许，提示"请输入昵称"
- [ ] 昵称超过 20 字符 → 前端截断提示
- [ ] 头像上传失败 → 不更新，显示重试
- [ ] 设置页数据来自 GET /auth/me（已有端点），新增字段需返回 email + avatarUrl
- [ ] 未登录用户访问设置页 → 重定向到登录页

---

## 8. Forgot Password UI (忘记密码前端)

> 后端接口见 [auth-core.md](./auth-core.md) 章节 4

### 页面结构

从登录页"忘记密码？"链接进入，分 3 步：

```
Step 1: 输入邮箱
┌─────────────────────────┐
│  ← 忘记密码              │
│                         │
│  请输入注册时使用的邮箱    │
│  ┌─────────────────┐    │
│  │ 邮箱地址         │    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │   发送验证码      │    │
│  └─────────────────┘    │
└─────────────────────────┘

Step 2: 输入验证码（同注册流程）

Step 3: 设置新密码
┌─────────────────────────┐
│  设置新密码              │
│  ┌─────────────────┐    │
│  │ 新密码      👁   │    │
│  └─────────────────┘    │
│  ■■■■□ 强                │
│  ┌─────────────────┐    │
│  │ 确认密码    👁   │    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │   重置密码       │    │
│  └─────────────────┘    │
└─────────────────────────┘
```

### 场景

#### 场景 8.1：忘记密码 — 完整流程
```
假设 (Given)  用户在登录页点击"忘记密码？"
当   (When)   输入邮箱 test@example.com
并且 (And)    点击发送验证码
那么 (Then)   调用 POST /auth/send-email-code { email, purpose: "reset_password" }
并且 (And)    进入验证码输入步骤

当   (When)   输入正确验证码
那么 (Then)   调用 POST /auth/verify-email-code { email, code, purpose: "reset_password" }
并且 (And)    进入设置新密码步骤

当   (When)   输入新密码并确认
那么 (Then)   调用 POST /auth/reset-password { email, verificationToken, newPassword }
并且 (And)    成功后显示"密码重置成功"
并且 (And)    自动跳转到登录页（邮箱预填）
```

#### 场景 8.2：返回登录
```
假设 (Given)  用户在忘记密码任意步骤
当   (When)   点击左上角返回箭头
那么 (Then)   返回登录页
并且 (And)    忘记密码状态清除
```

#### 场景 8.3：仅邮箱可用
```
假设 (Given)  用户在手机号 Tab 点击"忘记密码？"
当   (When)   进入忘记密码页面
那么 (Then)   提示"当前仅支持通过邮箱重置密码"
并且 (And)    显示邮箱输入框
```

### 边界条件
- [ ] 密码确认不一致 → 提示"密码不一致"，禁用提交
- [ ] 重置成功后 verificationToken 作废（后端一次性）
- [ ] Step 间返回：Step 3 返回不回到 Step 2（验证码已用），而是回到 Step 1 重来

---

## 9. Advanced Auth (高级认证 — 远期)

> 来源：auth-hardening Phase 4（远期，邮箱认证完成后排期）

### 远期待做

| 模块 | 工作 |
|------|------|
| 短信服务 | 接入阿里云/腾讯云 SMS |
| 手机号验证码注册 | 注册时增加短信验证步骤 |
| 手机号绑定 | 邮箱用户绑定手机号 |
| 手机号重置密码 | 通过短信验证码重置 |
| 多设备管理 | 设置页"已登录设备"列表 + 踢出按钮 |
| OAuth | Google / Apple / 微信登录 |

---

## Implementation Phases (实施阶段)

### Phase 1：竞态修复 + token 延长 + 主动续期 <!-- ✅ completed -->
> 对应章节：1. Token Management + 3. Login & Registration UX (错误清除部分)
> 详见 [auth-core.md](./auth-core.md) 章节 1

| 文件 | 改动 |
|------|------|
| `shared/lib/api.ts` | tryRefreshToken 加锁 + ensureFreshToken 主动续期 |
| `gateway/src/auth/jwt.ts` | access token 15m → 2h |
| `features/auth/hooks/use-auth.ts` | 新增 clearError |
| `app/page.tsx` | 模式切换调 clearError |

### Phase 2：记住账号 + 自动登录 + 密码体验 <!-- ✅ completed -->
> 对应章节：3. Login & Registration UX

| 文件 | 改动 |
|------|------|
| `features/auth/components/login-page.tsx` | 读取 lastPhone + 自动登录勾选 + 密码显隐 + 失败计数 |
| `features/auth/components/register-page.tsx` | 密码显隐 + 密码强度条 |
| `shared/lib/auth.ts` | token 存储策略（localStorage vs sessionStorage） |
| `features/auth/hooks/use-auth.ts` | 登录/注册成功存 lastPhone |

### Phase 3：注册加固
> 对应章节：5. Registration Safety

| 文件 | 改动 |
|------|------|
| `gateway/src/routes/auth.ts` | 注册流程加事务 |
| `gateway/src/db/repositories/app-user.ts` | createWithClient 方法 |
| `gateway/src/auth/link-device.ts` | linkDeviceToUserWithClient 方法 |
| `features/auth/components/register-page.tsx` | 手机号正则校验 |

### Phase 4：邮箱认证 + 用户设置 + 忘记密码
> 对应章节：6. Email Auth UI + 7. User Settings Page + 8. Forgot Password UI
> 后端对应 [auth-core.md](./auth-core.md) 章节 3-5

**Phase 4a：后端基础**

| 文件 | 改动 |
|------|------|
| `supabase/migrations/xxx_email_auth.sql` | app_user 加 email + avatar_url，新建 email_verification 表 |
| `gateway/src/auth/email.ts` | Resend 集成，发送验证邮件 |
| `gateway/src/auth/rate-limiter.ts` | 邮箱发送频率限制（60s/封 + 10次/小时/IP） |
| `gateway/src/db/repositories/email-verification.ts` | 验证码 CRUD |
| `gateway/src/routes/auth.ts` | 新增 send-email-code / verify-email-code / reset-password / bind-email 端点 |
| `gateway/src/routes/auth.ts` | 扩展 register / login 支持 email 字段 |
| `gateway/src/routes/auth.ts` | 新增 PATCH /auth/profile 端点 |

**Phase 4b：前端登录/注册改造**

| 文件 | 改动 |
|------|------|
| `features/auth/components/login-page.tsx` | Tab 切换（手机号/邮箱）+ 邮箱登录 + 忘记密码入口 |
| `features/auth/components/register-page.tsx` | Tab 切换 + 邮箱注册分步流程（验证码） |
| `features/auth/components/verification-code-input.tsx` | 新增：6 位验证码输入组件 |
| `features/auth/components/forgot-password.tsx` | 新增：忘记密码流程页 |
| `features/auth/hooks/use-auth.ts` | 新增 email 登录/注册方法 |
| `shared/lib/api/auth.ts` | 新增 sendEmailCode / verifyEmailCode / resetPassword / bindEmail / updateProfile API |

**Phase 4c：用户设置页**

| 文件 | 改动 |
|------|------|
| `features/auth/components/user-settings.tsx` | 新增：用户设置页 |
| `features/auth/components/bind-email-flow.tsx` | 新增：邮箱绑定流程组件 |
| `features/sidebar/components/sidebar-drawer.tsx` | 用户头像/名称区域增加设置页入口 |
| `app/page.tsx` | 路由：设置页状态管理 |

### Phase 5（远期）：短信验证 + OAuth
> 对应章节：9. Advanced Auth

### Device ID Deprecation <!-- ✅ completed -->
> 对应章节：4. Device ID Deprecation（独立时间线，已完成）

### Session Lifecycle <!-- ✅ completed -->
> 对应章节：2. Session Lifecycle（独立时间线，已完成）
> 详见 [auth-core.md](./auth-core.md) 章节 2

---

## 依赖
- shared/lib/storage.ts — 跨平台存储（已有）
- gateway/src/db/pool.ts — 事务支持（需要 client-level query）
- resend — 邮件发送服务（Phase 4 新增）
- lucide-react Eye/EyeOff/Mail/Phone/User/Camera 图标
- 附件上传系统 — 头像上传（已有 attachment-persistence spec）

## 关键文件
- `features/auth/hooks/use-auth.ts` — 前端 auth 状态管理
- `features/auth/components/login-page.tsx` — 登录页
- `features/auth/components/register-page.tsx` — 注册页
- `features/auth/components/user-settings.tsx` — 用户设置页（新增）
- `features/auth/components/forgot-password.tsx` — 忘记密码（新增）
- `features/auth/components/verification-code-input.tsx` — 验证码输入组件（新增）
- `features/sidebar/components/sidebar-drawer.tsx` — 退出按钮 + 设置入口
- `app/page.tsx` — 登录/注册模式切换
- `gateway/src/routes/auth.ts` — 后端路由
- `gateway/src/auth/email.ts` — Resend 邮件发送（新增）
