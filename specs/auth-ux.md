---
id: "054b"
title: "Auth — UX & Registration"
status: active
domain: auth
dependencies: ["auth-core.md"]
superseded_by: null
related: ["auth-core.md"]
created: 2026-03-23
updated: 2026-04-04
---

# Auth — UX & Registration (认证前端体验层)

> 拆分自：auth.md（原 054）
> Token 管理与会话生命周期见 [auth-core.md](./auth-core.md)

## 概述

本文档覆盖认证系统的前端体验：登录/注册 UX 优化、device_id 身份废弃、注册事务保护、远期高级认证，以及整体实施阶段。

---

## 3. Login & Registration UX (登录注册体验)

> 来源：auth-hardening Phase 2 + fix-auth-error-leak

### 问题诊断

- 被踢后回到登录页，输入框空白，用户需要重新输入手机号和密码
- 登录失败的错误消息在切换到注册页后仍然残留
- 无"记住账号"、"自动登录"选项
- 无忘记密码流程
- 密码框无显示/隐藏切换，输错概率高

#### 错误泄漏根因（fix-auth-error-leak）

login/register 共享同一个 error state，切换模式时未清除：

```
useAuth() hook
  └─ const [error, setError] = useState<string | null>(null)  // 单一 error
  └─ login()  → setError("手机号或密码错误")
  └─ register() → setError("注册失败")

app/page.tsx
  └─ onSwitchToRegister(() => setAuthMode("register"))  // 未清 error ❌
  └─ onSwitchToLogin(() => setAuthMode("login"))          // 未清 error ❌
```

### 修复方案

#### Fix 5：记住账号 + 记住密码 + 自动登录 <!-- ✅ completed -->

**记住账号（默认开启）：**
- 登录/注册成功后将手机号/邮箱存入 `localStorage("voicenote:lastPhone"` / `"voicenote:lastEmail")`
- 登录页初始化时读取并填入输入框
- 同时记住上次登录方式 `localStorage("voicenote:lastLoginMethod")` = "phone" | "email"

**记住密码（用户可选，默认关闭）：**
- 登录页增加"记住密码"勾选框
- 勾选时：登录成功后将密码存入 `localStorage("voicenote:savedPassword")`，下次打开自动填充
- 取消勾选时：清除已保存的密码
- 偏好存 `localStorage("voicenote:rememberPassword")` = "1" | "0"

**自动登录（用户可选，默认开启）：**
- 登录页增加"自动登录"勾选框
- 勾选时：重新打开浏览器后仍保持登录态
- 不勾选时：重新打开浏览器后需重新登录（token 被清除）
- 实现机制：`sessionStorage("voicenote:sessionAlive")` 标记当前浏览器会话，`useAuth` initAuth 时检查该标记 + autoLogin 偏好决定是否清除 token
- 自动登录状态存 `localStorage("voicenote:autoLogin")` = "1" | "0"

**表单 autoComplete 属性：**
- 账号输入框加 `name="phone"` / `name="email"` 属性帮助浏览器正确区分
- 注册页昵称输入框 `autoComplete="off"` 防止浏览器将昵称误填入登录页账号栏

#### Fix 6：密码显示/隐藏切换 <!-- ✅ completed -->

登录和注册页的密码框增加"眼睛"图标，点击切换 `type="password"` / `type="text"`。
减少输错密码的概率，尤其在手机端。

#### Fix 7：登录/注册错误清除 <!-- ✅ completed -->

```typescript
// features/auth/hooks/use-auth.ts — 新增 clearError
const clearError = useCallback(() => setError(null), []);

// app/page.tsx — 模式切换时清 error
onSwitchToRegister={() => { clearError(); setAuthMode("register"); }}
onSwitchToLogin(() => { clearError(); setAuthMode("login"); }}
```

#### Fix 8：登录错误细化 + 失败次数跟踪 <!-- ✅ completed -->

```typescript
// login-page.tsx
const [failCount, setFailCount] = useState(0);

// 登录失败时
setFailCount((c) => c + 1);

// 第 3 次失败后显示提示
{failCount >= 3 && (
  <p className="text-xs text-muted-accessible">忘记密码？请联系客服或重新注册</p>
)}
```

远期接入短信验证码后改为"忘记密码？短信重置"。

#### Fix 10：密码强度提示（注册时） <!-- ✅ completed -->

```typescript
// register-page.tsx
function getPasswordStrength(pw: string): "weak" | "medium" | "strong" {
  if (pw.length < 6) return "weak";
  if (pw.length >= 10 && /[A-Z]/.test(pw) && /\d/.test(pw)) return "strong";
  return "medium";
}
```

### 场景

#### 场景 3.1：记住账号 <!-- ✅ completed -->
```
假设 (Given)  用户用手机号 13800138000 登录成功
当   (When)   用户退出登录或被踢出
那么 (Then)   登录页手机号输入框预填 "13800138000"
并且 (And)    密码框为空
并且 (And)    用户只需输入密码即可登录
```

#### 场景 3.2：自动登录开启（默认） <!-- ✅ completed -->
```
假设 (Given)  用户勾选了"自动登录"（默认勾选）
当   (When)   关闭浏览器后重新打开 app
那么 (Then)   自动进入已登录状态（token 在 localStorage）
并且 (And)    不显示登录页
```

#### 场景 3.3：自动登录关闭 <!-- ✅ completed -->
```
假设 (Given)  用户取消了"自动登录"勾选
当   (When)   关闭浏览器后重新打开 app
那么 (Then)   显示登录页
并且 (And)    手机号输入框预填（记住账号仍生效）
```

#### 场景 3.4：登录/注册错误消息不泄漏 <!-- ✅ completed -->
```
假设 (Given)  用户在登录页看到"手机号或密码错误"
当   (When)   点击"没有账号？立即注册"
那么 (Then)   注册页不显示任何错误消息
```

#### 场景 3.5：登录失败后切换到注册 <!-- ✅ completed -->
```
假设 (Given)  用户在登录页输入了错误的手机号/密码
并且 (And)    页面显示"手机号或密码错误"
当   (When)   用户点击"没有账号？立即注册"
那么 (Then)   注册表单显示，错误消息消失
并且 (And)    所有输入框为空
```

#### 场景 3.6：注册失败后切换到登录 <!-- ✅ completed -->
```
假设 (Given)  用户在注册页提交了已存在的手机号
并且 (And)    页面显示"手机号已注册"
当   (When)   用户点击"已有账号？直接登录"
那么 (Then)   登录表单显示，错误消息消失
并且 (And)    输入框为空
```

#### 场景 3.7：注册表单本地校验错误不影响切换 <!-- ✅ completed -->
```
假设 (Given)  用户在注册页输入了不匹配的密码
并且 (And)    显示本地校验错误"密码不一致"
当   (When)   用户切换到登录页再切回注册页
那么 (Then)   所有本地校验错误消失
```

#### 场景 3.8：网络错误不泄漏到其他表单 <!-- ✅ completed -->
```
假设 (Given)  登录请求因网络断开失败，显示"网络错误"
当   (When)   网络恢复，用户切换到注册页
那么 (Then)   不显示"网络错误"
```

#### 场景 3.9：密码可见性切换 <!-- ✅ completed -->
```
假设 (Given)  用户在登录页输入密码
当   (When)   点击密码框右侧眼睛图标
那么 (Then)   密码切换为明文显示
并且 (And)    再次点击恢复密文
```

#### 场景 3.10：密码强度提示 <!-- ✅ completed -->
```
假设 (Given)  用户在注册页输入密码
当   (When)   密码为 "123456"（纯数字 6 位）
那么 (Then)   强度条显示 1/3（弱，红色）
当   (When)   密码改为 "test123456"（字母+数字 10 位）
那么 (Then)   强度条显示 2/3（中，橙色）
当   (When)   密码改为 "Test123456!"（大小写+数字+符号）
那么 (Then)   强度条显示 3/3（强，绿色）
```

#### 场景 3.11：多次登录失败提示 <!-- ✅ completed -->
```
假设 (Given)  用户连续 3 次登录失败
当   (When)   第 3 次失败后
那么 (Then)   除错误消息外，额外显示"忘记密码？请联系客服或重新注册"
```

### 边界条件
- [x] 快速连续切换登录/注册多次 → 无残留错误
- [x] 登录失败 → 切注册 → 注册失败 → 切登录 → 不显示旧错误
- [ ] 自动登录 off + 记住账号 on → token 不持久但手机号持久
- [ ] 密码包含特殊字符（引号、反斜杠）→ JSON 序列化安全
- [ ] 手机号前后空格 → trim 处理（当前已有）
- [ ] 密码强度条不阻止提交 → 只是视觉提示，用户可以用弱密码
- [ ] loading 状态切换 → 不应中断 loading 中的请求

---

## 4. Device ID Deprecation (设备 ID 废弃)

> 来源：device-id-deprecation
> 状态：✅ 已完成

### 背景

系统从"游客模式（device_id 即用户）"演进到"强制登录制（JWT + user_id）"，但大量代码和数据库约束仍把 device_id 当用户身份使用，导致：

1. **UNIQUE(device_id)** 约束 → 同设备多用户数据互踩
2. **userId ?? deviceId** 回退 → 写入时身份混淆
3. **device_id 当 user_id 传参** → Strike 归属错误

### 当前状态

| 表 | device_id 约束 | user_id 约束 | 问题 |
|----|---------------|-------------|------|
| user_profile | NOT NULL UNIQUE | 可选 | 同设备第二个用户写入冲突 |
| notebook | NOT NULL, UNIQUE(device_id, name) | 可选 | 同设备同名笔记本覆盖 |
| soul | UNIQUE(device_id) | 可选（有 partial unique index） | 两种 upsert 路径不一致 |
| skill_config | FK, UNIQUE(device_id, skill_name) | 可选 | 同设备配置互踩 |
| daily_briefing | UNIQUE(device_id, date, type) | 条件唯一索引（038 加的） | 已修过，尚可 |
| ai_diary | NOT NULL, UNIQUE(device_id, notebook, date) | 可选 | 同设备同日志覆盖 |

### device_id 保留的合理职责

device_id 不应废弃字段本身，而是**停止作为用户身份使用**。保留用途：

- WebSocket 连接追踪（哪台设备在线）
- ASR 音频流绑定（一个设备同时只有一路音频）
- 多设备同步标记（哪条记录来自哪台设备）
- 推送通知目标设备

### 改动原则

1. **所有写入操作必须以 user_id 为主键**，device_id 仅作为附加元数据
2. **UNIQUE 约束从 device_id 迁移到 user_id 维度**
3. **移除所有 `userId ?? deviceId` 的写入回退**（查询日志除外）
4. **device_id 列保留但改为可选**（允许 NULL）

### 场景

#### 场景 4.1：数据库约束迁移 <!-- ✅ completed -->

```
假设 (Given)  当前表有 UNIQUE(device_id) 或 UNIQUE(device_id, ...) 约束
当   (When)   执行迁移 044_identity_cleanup.sql
那么 (Then)   以下约束变更生效：

  user_profile:
    - DROP CONSTRAINT user_profile_device_id_key（去掉 UNIQUE(device_id)）
    - ALTER device_id DROP NOT NULL
    - ADD UNIQUE(user_id) WHERE user_id IS NOT NULL

  notebook:
    - DROP CONSTRAINT notebook_device_id_name_key
    - ALTER device_id DROP NOT NULL
    - ADD UNIQUE(user_id, name) WHERE user_id IS NOT NULL
    - 保留 UNIQUE(device_id, name) WHERE user_id IS NULL（兼容历史数据）

  soul:
    - DROP CONSTRAINT soul_device_id_key（去掉 UNIQUE(device_id)）
    - ALTER device_id DROP NOT NULL
    - 已有 partial unique index on user_id（014_auth 加的），保留

  skill_config:
    - DROP CONSTRAINT skill_config_device_id_skill_name_key
    - ALTER device_id DROP NOT NULL
    - ADD UNIQUE(user_id, skill_name) WHERE user_id IS NOT NULL

  ai_diary:
    - DROP CONSTRAINT ai_diary_device_id_notebook_entry_date_key
    - ALTER device_id DROP NOT NULL
    - ADD UNIQUE(user_id, notebook, entry_date) WHERE user_id IS NOT NULL

并且 (And)  回填：对所有 user_id IS NULL 的行，
            通过 device.user_id 补充 user_id
```

#### 场景 4.2：user-profile 仓库修复 <!-- ✅ completed -->

```
假设 (Given)  用户已登录（有 user_id）
当   (When)   调用 upsertOnboardingField / upsert / upsertByUser
那么 (Then)   优先按 user_id 查找已有行
并且 (And)    找到 → UPDATE
并且 (And)    未找到 → INSERT，ON CONFLICT (user_id) DO UPDATE
并且 (And)    device_id 作为可选元数据写入，不参与冲突解决

当   (When)   findByDevice 被调用
那么 (Then)   仅用于兼容旧代码，新代码统一用 findByUser
```

#### 场景 4.3：notebook 仓库修复 <!-- ✅ completed -->

```
假设 (Given)  已登录用户创建/查找笔记本
当   (When)   调用 findOrCreateByUser(userId, deviceId, name)
那么 (Then)   ON CONFLICT (user_id, name) WHERE user_id IS NOT NULL
             DO UPDATE SET device_id = $deviceId（更新最后使用设备）
并且 (And)    不再用 ON CONFLICT (device_id, name)

当   (When)   调用 findOrCreate(deviceId, name)（无 userId 的旧接口）
那么 (Then)   标记 @deprecated
并且 (And)    内部尝试通过 device.user_id 反查，有则走 user 路径
```

#### 场景 4.4：soul 仓库修复 <!-- ✅ completed -->

```
假设 (Given)  已登录用户更新 soul
当   (When)   调用 soul 的 upsert 系列函数
那么 (Then)   统一走 upsertByUser 路径
并且 (And)    旧的 upsert(deviceId, content) 标记 @deprecated
并且 (And)    ON CONFLICT 使用 user_id partial unique index
```

#### 场景 4.5：skill_config 仓库修复 <!-- ✅ completed -->

```
假设 (Given)  已登录用户配置技能
当   (When)   调用 upsert(deviceId, userId, skillName, enabled, config)
那么 (Then)   ON CONFLICT (user_id, skill_name) WHERE user_id IS NOT NULL
并且 (And)    device_id 仅作为元数据记录

当   (When)   userId 为 null（不应发生，但防御性处理）
那么 (Then)   回退到 ON CONFLICT (device_id, skill_name)
并且 (And)    打印 warning 日志
```

#### 场景 4.6：ai_diary 仓库修复 <!-- ✅ completed -->

```
假设 (Given)  系统写入 AI 日记
当   (When)   调用 upsert(deviceId, userId, notebook, date, ...)
那么 (Then)   有 userId → ON CONFLICT (user_id, notebook, entry_date)
并且 (And)    无 userId → 回退到 ON CONFLICT (device_id, notebook, entry_date)
```

#### 场景 4.7：topics.ts 身份修复 <!-- ✅ completed -->

```
假设 (Given)  用户收获目标时创建 review strike
当   (When)   topics.ts 执行 strikeRepo.create
那么 (Then)   user_id 取自请求的已认证 userId（getUserId(req)）
并且 (And)    不再使用 goal.device_id 作为 user_id
```

#### 场景 4.8：daily-cycle.ts 修复 <!-- ✅ completed -->

```
假设 (Given)  daily-cycle 函数接收参数
当   (When)   需要 deviceId
那么 (Then)   不能用 userId 回退（两者语义完全不同）
并且 (And)    deviceId 缺失时跳过该操作或从 device 表查询
```

#### 场景 4.9：auth.ts refresh token 修复 <!-- ✅ completed -->

```
假设 (Given)  用户刷新 token
当   (When)   refresh_token 表的 device_id 为 NULL
那么 (Then)   从 device 表查询该用户绑定的设备
并且 (And)    不再用 payload.userId 冒充 deviceId
```

#### 场景 4.10：消除写入路径的 userId ?? deviceId <!-- ✅ completed -->

```
假设 (Given)  代码中存在 `const key = userId ?? deviceId`
当   (When)   该 key 用于写入操作（INSERT/UPDATE/upsert）
那么 (Then)   必须改为严格要求 userId
并且 (And)    userId 缺失时抛错或 return（不回退到 deviceId）

当   (When)   该 key 仅用于日志/队列序列化
那么 (Then)   可保留回退，但 key 前加前缀区分：
             `user:${userId}` 或 `device:${deviceId}`
```

#### 场景 4.11：goals.ts resolveUserId 简化 <!-- ✅ completed -->

```
假设 (Given)  目标 API 需要获取用户身份
当   (When)   请求头没有 user_id（JWT 缺失）
那么 (Then)   直接返回 401，不再通过 device 表反查 user_id
并且 (And)    移除 resolveUserId 函数中的 device fallback
```

### 涉及文件

#### 数据库迁移（新建）

| 文件 | 改动 |
|------|------|
| `supabase/migrations/044_identity_cleanup.sql` | 约束迁移 + 数据回填 |

#### 仓库层（核心修复）

| 文件 | 改动 |
|------|------|
| `gateway/src/db/repositories/user-profile.ts` | ON CONFLICT 改 user_id 维度（已部分修复） |
| `gateway/src/db/repositories/notebook.ts` | ON CONFLICT → (user_id, name) |
| `gateway/src/db/repositories/soul.ts` | 废弃 upsert(deviceId)，统一走 upsertByUser |
| `gateway/src/db/repositories/skill-config.ts` | ON CONFLICT → (user_id, skill_name) |
| `gateway/src/db/repositories/ai-diary.ts` | ON CONFLICT → (user_id, notebook, entry_date) |

#### 路由/处理层（身份修复）

| 文件 | 改动 |
|------|------|
| `gateway/src/routes/topics.ts` | line 250: user_id 取自 getUserId(req) |
| `gateway/src/routes/goals.ts` | 移除 resolveUserId 的 device fallback |
| `gateway/src/routes/auth.ts` | line 133: 不用 userId 冒充 deviceId |
| `gateway/src/routes/stats.ts` | userId ?? deviceId → 要求 userId |
| `gateway/src/routes/sync.ts` | 同上 |
| `gateway/src/cognitive/daily-cycle.ts` | line 70: 修正回退方向 |
| `gateway/src/profile/manager.ts` | 队列 key 加前缀 |
| `gateway/src/soul/manager.ts` | 同上 |
| `gateway/src/handlers/daily-loop.ts` | 日志用回退可保留 |

### 验收标准

1. 同一设备两个用户登录后，各自 profile / notebook / soul / skill_config 独立
2. 所有 INSERT/UPSERT 语句的 ON CONFLICT 以 user_id 为维度
3. 代码中不再有 device_id 被当作 user_id 传入 strikeRepo.create
4. `grep -r "userId ?? deviceId" gateway/src/` 的结果中，无一处用于 DB 写入
5. 迁移脚本幂等，可重复执行不报错
6. E2E 冷启动测试通过（种子目标 + 侧边栏）
7. 现有用户数据不丢失（回填 + 兼容约束）

### 边界条件
- [x] 历史数据中 user_id 为 NULL 的行：迁移时通过 device.user_id 回填
- [x] 回填后仍有 user_id = NULL（device 未绑用户）：保留，用 device_id 约束兜底
- [x] 迁移幂等：所有 DROP/ADD 用 IF EXISTS / IF NOT EXISTS
- [ ] 前端仍发送 X-Device-Id header：保留，但后端不再用它做身份判断
- [x] goalAutoLink / getProjectProgress 中 `userId ?? deviceId` 参数：改为必须 userId
- [x] daily_briefing 已在 038 中修过 partial unique index：本次不动

---

## 5. Registration Safety (注册事务保护)

> 来源：auth-hardening Phase 3

### 问题诊断

注册流程无事务保护：

```typescript
const user = await appUserRepo.create({...});       // ✅ 写入 DB
await linkDeviceToUser(body.deviceId, user.id);      // ❌ 如果失败
const tokens = await issueTokens(user.id, ...);     // ❌ 不执行
// 用户已存在于 DB，但前端收到 500，以为注册失败
```

如果 linkDeviceToUser 失败（deviceId 不存在、网络抖动等），用户记录已写入但 token 未返回。
此时重新注册同号 → 409 "已注册"；登录同号 → 应该能成功（如果密码没记错）。

### 修复方案

#### Fix 4：注册流程加事务保护

```typescript
// gateway/src/routes/auth.ts register handler
const client = await getPool().connect();
try {
  await client.query("BEGIN");
  const user = await appUserRepo.createWithClient(client, { phone, password_hash, display_name });
  await linkDeviceToUserWithClient(client, body.deviceId, user.id);
  const tokens = await issueTokensWithClient(client, user.id, body.deviceId);
  await client.query("COMMIT");
  sendJson(res, { user: {...}, ...tokens }, 201);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}
```

#### Fix 9：注册手机号格式校验

**近期（前端校验）：**
```typescript
// register-page.tsx
const isValidPhone = /^1[3-9]\d{9}$/.test(phone);

// 输入框失焦时
{phone && !isValidPhone && (
  <p className="text-xs text-maple">请输入正确的手机号</p>
)}

// 注册按钮
disabled={!isValidPhone || !password || ...}
```

### 场景

#### 场景 5.1：注册中途网络断开
```
假设 (Given)  用户正在注册
当   (When)   appUserRepo.create 成功但 linkDeviceToUser 失败
那么 (Then)   事务回滚，app_user 中不残留记录
并且 (And)    用户看到"注册失败，请重试"
并且 (And)    用同一手机号重新注册可以成功
```

#### 场景 5.2：手机号格式校验 <!-- ✅ completed -->
```
假设 (Given)  用户在注册页输入 "abc123"
当   (When)   输入框失焦
那么 (Then)   显示"请输入正确的手机号"
并且 (And)    注册按钮禁用
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `gateway/src/routes/auth.ts` | 注册流程加事务 |
| `gateway/src/db/repositories/app-user.ts` | createWithClient 方法 |
| `gateway/src/auth/link-device.ts` | linkDeviceToUserWithClient 方法 |
| `features/auth/components/register-page.tsx` | 手机号正则校验 |

### 边界条件
- [ ] 注册事务回滚后 unique constraint 释放 → 重试可成功

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
