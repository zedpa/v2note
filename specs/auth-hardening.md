---
status: superseded
superseded_by: "auth.md"
id: "auth-hardening"
domain: auth
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# Auth 加固：登录保持 + 竞态修复 + 体验优化

> 状态：🔵 Phase 1-2 已完成，Phase 3-4 待开发

## 概述

用户反馈两类问题：
1. 登录后过一会被踢出，需要重新输入账号密码
2. 昨天注册的账号今天登录失败，重新注册又可以

根因是 auth 系统存在多个层面的脆弱性：token 竞态、生命周期过短、无记忆凭据、注册无事务保护。

## 问题诊断

### 问题 1：意外被登出

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

### 问题 2：昨天注册今天登录失败

**最可能原因：用户记错了账号**

注册表单 placeholder 写"手机号"但不校验格式，用户可能输入了任意字符串（如 "zeds"），第二天忘了输的什么。

**次要原因：注册流程无事务保护**

```typescript
const user = await appUserRepo.create({...});       // ✅ 写入 DB
await linkDeviceToUser(body.deviceId, user.id);      // ❌ 如果失败
const tokens = await issueTokens(user.id, ...);     // ❌ 不执行
// 用户已存在于 DB，但前端收到 500，以为注册失败
```

如果 linkDeviceToUser 失败（deviceId 不存在、网络抖动等），用户记录已写入但 token 未返回。
此时重新注册同号 → 409 "已注册"；登录同号 → 应该能成功（如果密码没记错）。

### 问题 3：登录体验断裂

- 被踢后回到登录页，输入框空白，用户需要重新输入手机号和密码
- 登录失败的错误消息在切换到注册页后仍然残留
- 无"记住账号"、"自动登录"选项
- 无忘记密码流程
- 密码框无显示/隐藏切换，输错概率高

## 修复方案

### Fix 1：前端 Refresh Token 加锁（关键）

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

### Fix 2：Access Token 延长到 2 小时

```typescript
// gateway/src/auth/jwt.ts
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "2h" });  // 原来是 "15m"
}
```

B2C 产品标准做法。15m 适合金融场景，对笔记/效率工具太激进。

### Fix 3：主动续期（token 快过期时后台静默 refresh）

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

### Fix 4：注册流程加事务保护

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

### Fix 5：记住账号 + 自动登录

**记住账号（默认开启）：**
- 登录/注册成功后将手机号存入 `localStorage("voicenote:lastPhone")`
- 登录页初始化时读取并填入输入框
- 不存密码（安全原则）

**自动登录（用户可选，默认开启）：**
- 登录页增加"自动登录"勾选框
- 勾选时：token 存 `localStorage`（持久，当前行为）
- 不勾选时：token 存 `sessionStorage`（关闭浏览器即清除）
- 自动登录状态存 `localStorage("voicenote:autoLogin")` = "1"

**密码记忆（浏览器原生）：**
- 确保表单结构符合浏览器密码管理器识别标准
- `input[type=tel][autoComplete=tel]` for phone
- `input[type=password][autoComplete=current-password]` for login
- 当前已基本符合

### Fix 6：密码显示/隐藏切换

登录和注册页的密码框增加"眼睛"图标，点击切换 `type="password"` / `type="text"`。
减少输错密码的概率，尤其在手机端。

### Fix 7：登录/注册错误清除

```typescript
// app/page.tsx — 模式切换时清 error
// features/auth/hooks/use-auth.ts — 新增 clearError
const clearError = useCallback(() => setError(null), []);

// app/page.tsx
onSwitchToRegister={() => { clearError(); setAuthMode("register"); }}
onSwitchToLogin={() => { clearError(); setAuthMode("login"); }}
```

### Fix 8：登录错误细化 + 失败次数跟踪

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

### Fix 9：注册手机号格式校验

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

**远期（短信验证码）：**
注册时发送验证码，验证通过才创建账号。同时用于找回密码。

### Fix 10：密码强度提示（注册时）

```typescript
// register-page.tsx
function getPasswordStrength(pw: string): "weak" | "medium" | "strong" {
  if (pw.length < 6) return "weak";
  if (pw.length >= 10 && /[A-Z]/.test(pw) && /\d/.test(pw)) return "strong";
  return "medium";
}

// 密码框下方
<div className="h-1 rounded-full bg-surface-low">
  <div className={cn("h-full rounded-full transition-all",
    strength === "weak" && "w-1/3 bg-maple",
    strength === "medium" && "w-2/3 bg-deer",
    strength === "strong" && "w-full bg-green-500",
  )} />
</div>
```

## 场景

### 场景 1：并发 401 不导致登出
```
假设 (Given)  用户已登录，access token 刚过期
当   (When)   收到 3 个 API 请求同时返回 401
那么 (Then)   只发出 1 次 refresh 请求
并且 (And)    3 个请求都用新 token 重试成功
并且 (And)    用户无感知
```

### 场景 2：主动续期
```
假设 (Given)  用户已登录 1 小时 50 分钟（access token 剩余 10 分钟）
当   (When)   用户发起任意 API 请求
那么 (Then)   先后台静默 refresh，再发实际请求
并且 (And)    用户无感知，不经历 401
```

### 场景 3：2 小时内不需要 refresh
```
假设 (Given)  用户登录后正常使用
当   (When)   时间到达登录后 1.5 小时并发起请求
那么 (Then)   access token 仍有效，直接成功
并且 (And)    不触发 refresh 流程
```

### 场景 4：记住账号
```
假设 (Given)  用户用手机号 13800138000 登录成功
当   (When)   用户退出登录或被踢出
那么 (Then)   登录页手机号输入框预填 "13800138000"
并且 (And)    密码框为空
并且 (And)    用户只需输入密码即可登录
```

### 场景 5：自动登录开启（默认）
```
假设 (Given)  用户勾选了"自动登录"（默认勾选）
当   (When)   关闭浏览器后重新打开 app
那么 (Then)   自动进入已登录状态（token 在 localStorage）
并且 (And)    不显示登录页
```

### 场景 6：自动登录关闭
```
假设 (Given)  用户取消了"自动登录"勾选
当   (When)   关闭浏览器后重新打开 app
那么 (Then)   显示登录页
并且 (And)    手机号输入框预填（记住账号仍生效）
```

### 场景 7：注册中途网络断开
```
假设 (Given)  用户正在注册
当   (When)   appUserRepo.create 成功但 linkDeviceToUser 失败
那么 (Then)   事务回滚，app_user 中不残留记录
并且 (And)    用户看到"注册失败，请重试"
并且 (And)    用同一手机号重新注册可以成功
```

### 场景 8：登录/注册错误消息不泄漏
```
假设 (Given)  用户在登录页看到"手机号或密码错误"
当   (When)   点击"没有账号？立即注册"
那么 (Then)   注册页不显示任何错误消息
```

### 场景 9：手机号格式校验
```
假设 (Given)  用户在注册页输入 "abc123"
当   (When)   输入框失焦
那么 (Then)   显示"请输入正确的手机号"
并且 (And)    注册按钮禁用
```

### 场景 10：密码可见性切换
```
假设 (Given)  用户在登录页输入密码
当   (When)   点击密码框右侧眼睛图标
那么 (Then)   密码切换为明文显示
并且 (And)    再次点击恢复密文
```

### 场景 11：密码强度提示
```
假设 (Given)  用户在注册页输入密码
当   (When)   密码为 "123456"（纯数字 6 位）
那么 (Then)   强度条显示 1/3（弱，红色）
当   (When)   密码改为 "test123456"（字母+数字 10 位）
那么 (Then)   强度条显示 2/3（中，橙色）
当   (When)   密码改为 "Test123456!"（大小写+数字+符号）
那么 (Then)   强度条显示 3/3（强，绿色）
```

### 场景 12：多次登录失败提示
```
假设 (Given)  用户连续 3 次登录失败
当   (When)   第 3 次失败后
那么 (Then)   除错误消息外，额外显示"忘记密码？请联系客服或重新注册"
```

## 边界条件
- [ ] refresh 进行中又来新的 401 → 等同一个 Promise
- [ ] refresh 失败后立即又有 401 → 不应无限重试，直接 logout
- [ ] 多 tab 页面 → localStorage 变更跨 tab 同步（storage event）
- [ ] 自动登录 off + 记住账号 on → token 不持久但手机号持久
- [ ] 密码包含特殊字符（引号、反斜杠）→ JSON 序列化安全
- [ ] 手机号前后空格 → trim 处理（当前已有）
- [ ] 注册事务回滚后 unique constraint 释放 → 重试可成功
- [ ] 主动续期 + 被动 401 refresh 同时触发 → 加锁保证只发一次
- [ ] token 解析失败（格式异常）→ 跳过主动续期，等 401 兜底
- [ ] 密码强度条不阻止提交 → 只是视觉提示，用户可以用弱密码

## 实施阶段

### Phase 1：竞态修复 + token 延长 + 主动续期（紧急）
| 文件 | 改动 |
|------|------|
| `shared/lib/api.ts` | tryRefreshToken 加锁 + ensureFreshToken 主动续期 |
| `gateway/src/auth/jwt.ts` | access token 15m → 2h |
| `features/auth/hooks/use-auth.ts` | 新增 clearError |
| `app/page.tsx` | 模式切换调 clearError |

### Phase 2：记住账号 + 自动登录 + 密码体验
| 文件 | 改动 |
|------|------|
| `features/auth/components/login-page.tsx` | 读取 lastPhone + 自动登录勾选 + 密码显隐 + 失败计数 |
| `features/auth/components/register-page.tsx` | 密码显隐 + 密码强度条 |
| `shared/lib/auth.ts` | token 存储策略（localStorage vs sessionStorage） |
| `features/auth/hooks/use-auth.ts` | 登录/注册成功存 lastPhone |

### Phase 3：注册加固
| 文件 | 改动 |
|------|------|
| `gateway/src/routes/auth.ts` | 注册流程加事务 |
| `gateway/src/db/repositories/app-user.ts` | createWithClient 方法 |
| `gateway/src/auth/link-device.ts` | linkDeviceToUserWithClient 方法 |
| `features/auth/components/register-page.tsx` | 手机号正则校验 |

### Phase 4（远期）：短信验证码 + 找回密码
| 模块 | 工作 |
|------|------|
| 短信服务 | 接入阿里云/腾讯云 SMS |
| gateway | 新增 `/auth/send-code` + `/auth/verify-code` 端点 |
| 注册页 | 手机号验证码步骤 |
| 找回密码 | 新页面：输入手机号 → 验证码 → 重置密码 |
| 多设备管理 | 设置页"已登录设备"列表 + 踢出按钮 |

## 依赖
- shared/lib/storage.ts — 跨平台存储（已有）
- gateway/src/db/pool.ts — 事务支持（需要 client-level query）
- 短信验证码需要外部 SMS 服务（Phase 4）
- lucide-react Eye/EyeOff 图标（密码显隐，已装）
