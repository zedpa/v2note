# gene_app_update — 检查更新 + OTA 热更新 + APK 版本升级

## 概述

两层更新机制：OTA 热更新（Web bundle 替换，无需重装 APK）+ APK 版本检查（弹窗提示下载安装）。后端管理发布记录+bundle 存储，前端自动检查+静默/弹窗更新。

## 数据库

### app_release 表

```
id UUID PK, version TEXT, version_code INTEGER, platform TEXT DEFAULT 'android',
release_type TEXT ('apk'|'ota'), bundle_url TEXT, file_size INTEGER,
checksum TEXT (sha256), changelog TEXT, is_mandatory BOOLEAN,
is_active BOOLEAN DEFAULT true, min_native_version TEXT,
published_by TEXT, created_at TIMESTAMPTZ
UNIQUE(version, platform, release_type)
```

索引：`(platform, release_type, is_active, version_code DESC)`

Migration: `supabase/migrations/015_app_releases.sql`

## 后端架构

### Repository (`gateway/src/db/repositories/app-release.ts`)

| 方法 | 说明 |
|------|------|
| `findLatest(platform, releaseType, currentVersionCode, nativeVersion?)` | 查最新可用更新，OTA 额外检查 min_native_version |
| `findById(id)` | 按 ID 查 |
| `listAll(platform?)` | 管理列表 |
| `create(fields)` | 创建发布记录 |
| `setActive(id, active)` | 启用/禁用 |
| `update(id, fields)` | 更新记录 |

### 路由 (`gateway/src/routes/releases.ts`)

| 端点 | 说明 | 权限 |
|------|------|------|
| `GET /api/v1/releases/check` | 检查更新（query: platform, currentVersionCode, nativeVersion） | 公开 |
| `GET /api/v1/releases/bundles/:filename` | 下载 OTA zip 包（流式） | 公开 |
| `POST /api/v1/releases` | 创建发布记录 | Admin |
| `POST /api/v1/releases/:id/upload` | 上传 bundle zip（raw binary + sha256） | Admin |
| `PATCH /api/v1/releases/:id` | 编辑/启停发布 | Admin |
| `GET /api/v1/releases` | 列出所有发布 | Admin |

### Admin 鉴权

`requireAdmin(req)` — 验证 JWT，检查 userId 是否匹配 `ADMIN_USER_ID` 环境变量。

### Bundle 存储

`gateway/uploads/bundles/` 目录，文件名格式 `{releaseId}-{originalName}`，路由直接 pipe 文件流。

## 前端架构

### 更新服务 (`shared/lib/updater.ts`)

| 函数 | 说明 |
|------|------|
| `checkForUpdate()` | 检测平台 → 获取 versionCode → GET /check → 返回 CheckResult |
| `applyOtaUpdate(update)` | lazy import @capgo/capacitor-updater → download → set → reload |
| `openApkDownload(url)` | lazy import @capacitor/browser 打开下载，fallback window.open |

所有 Capacitor 插件 lazy import（项目规则）。

### Hook (`shared/hooks/use-update-check.ts`)

- 挂载后延迟 3s 执行 `checkForUpdate()`
- OTA 更新：自动静默下载+应用（显示"正在更新..."脉冲条）
- APK 更新：返回 `update` 对象供弹窗展示
- 返回 `{ update, dismiss, applying }`

### 更新弹窗 (`shared/components/update-dialog.tsx`)

- APK 更新：AlertDialog 显示版本号+changelog+"立即下载"/"稍后"
- mandatory 时隐藏"稍后"按钮
- OTA 更新：底部浮动脉冲条"正在更新..."

### 集成 (`app/page.tsx`)

auth gate 之后添加 `useUpdateCheck()` hook + `<UpdateDialog>` 组件。

## Capacitor 配置

`capacitor.config.ts` 添加：
```typescript
CapacitorUpdater: { autoUpdate: false }  // 手动控制更新流程
```

依赖：`@capgo/capacitor-updater`（MIT，self-hosted，原子替换+自动回滚）

## 发布脚本

| 脚本 | 用途 |
|------|------|
| `scripts/publish-ota.sh` | pnpm build → zip out/ → POST 创建记录 → POST 上传 bundle |
| `scripts/publish-apk.sh` | POST 创建 APK 记录（bundleUrl 指向外部下载地址） |
| `scripts/sync-version.cjs` | 读取 package.json version → 更新 build.gradle versionName |

`cap:sync` 脚本已集成 sync-version：`node scripts/sync-version.cjs && next build && cap sync`

## 环境变量

- `ADMIN_USER_ID` — 管理员用户 ID，用于发布接口鉴权

## 关键文件

**新建：**
- `supabase/migrations/015_app_releases.sql`
- `gateway/src/db/repositories/app-release.ts`
- `gateway/src/routes/releases.ts`
- `shared/lib/updater.ts`
- `shared/hooks/use-update-check.ts`
- `shared/components/update-dialog.tsx`
- `scripts/publish-ota.sh`, `scripts/publish-apk.sh`, `scripts/sync-version.cjs`
- `gateway/uploads/bundles/.gitkeep`
- `docs/gene/app-update.md`

**修改：**
- `gateway/src/db/repositories/index.ts` (导出 appReleaseRepo)
- `gateway/src/index.ts` (注册 releaseRoutes)
- `capacitor.config.ts` (CapacitorUpdater 配置)
- `app/page.tsx` (UpdateDialog 集成)
- `package.json` (@capgo/capacitor-updater 依赖 + cap:sync 脚本)
