---
name: deploy
description: 拉取代码、安装依赖、构建并重启 PM2 服务。用于 V2Note 项目的快速部署。
argument-hint: "[--skip-build|--skip-install|--only-restart|--migrate <NNN>]"
license: MIT
metadata:
  author: v2note
  version: "2.0.0"
---

# Deploy Skill - V2Note 部署流程

## 服务器信息

- SSH 别名: `ali-hangzhou`（见 `~/.ssh/config`，Host ali-hangzhou → 47.99.68.126 root）
- 项目路径: `/workspace/v2note`
- Gateway 路径: `/workspace/v2note/gateway`
- PM2 进程名: `v2note-gateway`
- Gateway 入口: `./dist/index.js`（tsc 编译输出）

## 参数

| 参数 | 说明 |
|------|------|
| (无参数) | 完整部署：push → pull → install → build → restart |
| `--skip-build` | 跳过构建步骤（仅当代码无变化时） |
| `--skip-install` | 跳过依赖安装 |
| `--only-restart` | 仅重启 PM2 服务 |
| `--migrate <NNN>` | 部署后执行指定迁移文件（如 `--migrate 070`） |

## 执行流程

严格按以下顺序执行，每步检查退出码，失败则停止并报告。

### Phase 1: 本地准备 + Push

```bash
# 1a. 如果有未提交的本地更改，先 stash
git stash push -m "deploy-stash-$(date +%Y%m%d-%H%M%S)"

# 1b. 检查是否有未推送的 commit
git log --oneline origin/main..HEAD

# 1c. Push 到远端（如果有新 commit）
git push origin main
```

### Phase 2: 服务器拉取 + 安装

```bash
# 2a. 拉取最新代码
ssh ali-hangzhou "cd /workspace/v2note && git pull origin main 2>&1"

# 2b. 安装依赖（除非 --skip-install）
ssh ali-hangzhou "cd /workspace/v2note && pnpm install 2>&1 | tail -10"
```

### Phase 3: 构建（除非 --skip-build）

前端和 Gateway 分别构建：

```bash
# 3a. Next.js 前端构建
ssh ali-hangzhou "cd /workspace/v2note && pnpm build 2>&1 | tail -20"

# 3b. Gateway 构建（tsc 编译）
ssh ali-hangzhou "cd /workspace/v2note/gateway && pnpm build 2>&1 | tail -10"
```

**Gateway 构建失败排查**：
- 如果报 `Cannot find module '@sentry/node'`，执行 `pnpm add -D @sentry/node`
- 这是 pre-existing 问题，sentry 是可选 devDep

### Phase 4: 重启服务

```bash
ssh ali-hangzhou "cd /workspace/v2note/gateway && pm2 restart v2note-gateway 2>&1 && sleep 2 && pm2 list 2>&1"
```

验证：status 应为 `online`，uptime 为 `0s` 或 `2s`。

### Phase 5: 数据库迁移（仅当指定 --migrate）

**重要**：服务器上没有 psql，使用 node + pg 执行 SQL。

#### 5a. 迁移预览（可选但建议）

在执行前先查看影响范围，用 node 跑只读查询评估。

#### 5b. 执行迁移

```bash
ssh ali-hangzhou 'cd /workspace/v2note/gateway && node -e "
const dotenv = require(\"dotenv\");
const fs = require(\"fs\");
dotenv.config();
const { Pool } = require(\"pg\");
const pool = new Pool({
  host: process.env.RDS_HOST,
  port: parseInt(process.env.RDS_PORT || \"5432\"),
  database: process.env.RDS_DATABASE,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
(async () => {
  const sql = fs.readFileSync(\"/workspace/v2note/supabase/migrations/<MIGRATION_FILE>\", \"utf8\");
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(\"✅ 迁移执行成功\");
  } catch(e) {
    console.error(\"❌ 迁移失败:\", e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
"'
```

将 `<MIGRATION_FILE>` 替换为实际文件名（如 `070_goal_stale_cleanup.sql`）。

#### 5c. 迁移后重启

迁移后必须再次 `pm2 restart v2note-gateway`，让代码与数据库 schema 同步。

### Phase 6: 恢复本地状态

```bash
# 如果 Phase 1a 做了 stash，恢复
git stash pop
```

## 已知问题 & 排查

### DROP COLUMN 报依赖错误

```
cannot drop column xxx because other objects depend on it
```

用以下 node 脚本查找依赖对象：

```javascript
// 查询依赖某列的对象（VIEW、INDEX 等）
const deps = await pool.query(`
  SELECT pg_describe_object(d.classid, d.objid, d.objsubid) AS description
  FROM pg_depend d
  JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
  WHERE a.attname = '<column_name>' AND a.attrelid = '<table_name>'::regclass
    AND d.deptype = 'n'
`);
```

通常是 VIEW 依赖，需先 DROP VIEW → DROP COLUMN → 重建 VIEW（去掉被删列）。

### Gateway 构建失败

```bash
# 查看完整错误
ssh ali-hangzhou "cd /workspace/v2note/gateway && pnpm build 2>&1"

# 如果是缺少类型声明包
ssh ali-hangzhou "cd /workspace/v2note/gateway && pnpm add -D <package>"
```

### PM2 服务异常

```bash
# 查看最近日志
ssh ali-hangzhou "pm2 logs v2note-gateway --lines 30"

# 查看服务详情
ssh ali-hangzhou "pm2 show v2note-gateway"
```

### 回滚

```bash
# 服务器回退到上一个 commit
ssh ali-hangzhou "cd /workspace/v2note && git reset --hard HEAD~1"
ssh ali-hangzhou "cd /workspace/v2note/gateway && pnpm build && pm2 restart v2note-gateway"
```

⚠️ 数据库迁移无法自动回滚，需手动编写逆向 SQL。

### .env 文件格式问题

服务器 .env 文件可能有 Windows 换行符（\r），不能直接 `source` 读取。
一律通过 node + dotenv 加载环境变量，不用 shell source。

## 输出格式

每步完成后输出简短状态行：

```
✓ git push — 3 个 commit 推送成功
✓ git pull (服务器) — 15 个文件更新到 abc1234
✓ pnpm install — 2.2s
✓ pnpm build (Next.js) — 静态页面生成成功
✓ pnpm build (gateway) — tsc 编译成功
✓ pm2 restart — v2note-gateway online (pid 54598)
✓ 迁移 070 — 执行成功
✓ git stash pop — 本地更改已恢复
```
