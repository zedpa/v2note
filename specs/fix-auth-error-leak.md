# 修复：登录/注册错误状态泄漏

> 状态：✅ 已完成（合入 auth-hardening Phase 1）

## 概述
登录失败的错误消息"手机号或密码错误"在切换到注册表单后仍然残留显示，
让用户在还未提交注册时就看到错误提示，造成困惑。
根因是 login/register 共享同一个 error state，切换模式时未清除。

## 根因分析

### 状态共享链路
```
useAuth() hook
  └─ const [error, setError] = useState<string | null>(null)  // 单一 error
  └─ login()  → setError("手机号或密码错误")
  └─ register() → setError("注册失败")

app/page.tsx
  └─ const { error: authError } = useAuth()
  └─ authMode === "register" ? <RegisterPage error={authError} /> 
                              : <LoginPage error={authError} />
  └─ onSwitchToRegister={() => setAuthMode("register")}  // 未清 error ❌
  └─ onSwitchToLogin(() => setAuthMode("login"))          // 未清 error ❌
```

### 具体代码位置
| 文件 | 行号 | 问题 |
|------|------|------|
| features/auth/hooks/use-auth.ts | 23 | 共享 error state |
| app/page.tsx | 267 | `onSwitchToLogin` 未调用 setError(null) |
| app/page.tsx | 275 | `onSwitchToRegister` 未调用 setError(null) |
| features/auth/components/register-page.tsx | 46 | `displayError = localError \|\| error` 显示外部 error |

### 同类问题扫描
在整个 codebase 搜索了类似的状态泄漏模式：
- ProfileEditor、SettingsEditor 等 overlay 组件均使用独立本地 state ✅
- GoalDetailOverlay 打开/关闭时会 reset 内部 state ✅
- **唯一的泄漏点就是 auth 模块**

## 场景

### 场景 1: 登录失败后切换到注册
```
假设 (Given)  用户在登录页输入了错误的手机号/密码
并且 (And)    页面显示"手机号或密码错误"
当   (When)   用户点击"没有账号？立即注册"
那么 (Then)   注册表单显示，错误消息消失
并且 (And)    所有输入框为空
```

### 场景 2: 注册失败后切换到登录
```
假设 (Given)  用户在注册页提交了已存在的手机号
并且 (And)    页面显示"手机号已注册"
当   (When)   用户点击"已有账号？直接登录"
那么 (Then)   登录表单显示，错误消息消失
并且 (And)    输入框为空
```

### 场景 3: 注册表单本地校验错误不影响切换
```
假设 (Given)  用户在注册页输入了不匹配的密码
并且 (And)    显示本地校验错误"密码不一致"
当   (When)   用户切换到登录页再切回注册页
那么 (Then)   所有本地校验错误消失
```

### 场景 4: 网络错误不泄漏到其他表单
```
假设 (Given)  登录请求因网络断开失败，显示"网络错误"
当   (When)   网络恢复，用户切换到注册页
那么 (Then)   不显示"网络错误"
```

## 边界条件
- [ ] 快速连续切换登录/注册多次 → 无残留错误
- [ ] 登录失败 → 切注册 → 注册失败 → 切登录 → 只显示注册的错误？不显示
- [ ] 登录失败 → 切注册 → 直接提交（不改内容）→ 应显示注册相关错误
- [ ] loading 状态切换 → 不应中断 loading 中的请求

## 修复方案

### 方案 A：模式切换时清除 error（最小改动，推荐）

```typescript
// app/page.tsx
// 添加 clearError 方法或直接在切换时清
const { error: authError, login, register, logout, clearError } = useAuth();

// features/auth/hooks/use-auth.ts 新增:
const clearError = useCallback(() => setError(null), []);
return { ..., clearError };

// app/page.tsx 切换处:
onSwitchToRegister={() => { clearError(); setAuthMode("register"); }}
onSwitchToLogin={() => { clearError(); setAuthMode("login"); }}
```

### 方案 B：分离 loginError / registerError（更严谨）
拆分 error state 为两个独立的，各自只在对应操作时设置。
过度设计，login/register 不会同时显示，方案 A 足够。

## 影响范围
- features/auth/hooks/use-auth.ts — 新增 clearError（1 行）
- app/page.tsx — 两处 mode 切换回调（2 行改动）

## 决策：修 vs 重构
**修**。这是一个 2 行代码的修复，不值得重构整个 auth 模块。
Auth hook 整体设计合理（共享 hook + 独立组件），只是缺了切换时的清理。
