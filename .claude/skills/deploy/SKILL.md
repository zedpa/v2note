---
name: deploy
description: 拉取代码、安装依赖、构建并重启 PM2 服务。用于 V2Note 项目的快速部署。
argument-hint: "[--skip-build|--skip-install|--only-restart]"
license: MIT
metadata:
  author: v2note
  version: "1.0.0"
---

# Deploy Skill - V2Note 部署流程

一键执行完整的部署流程：拉取最新代码 → 安装依赖 → 构建 → 重启 PM2 服务。

## 使用方法

```bash
/claude deploy
```

### 可选参数

| 参数 | 说明 |
|------|------|
| `--skip-build` | 跳过构建步骤（仅当代码无变化时） |
| `--skip-install` | 跳过依赖安装 |
| `--only-restart` | 仅重启 PM2 服务 |

## 执行流程

### Phase 1: 拉取代码

```bash
git stash              # 保存本地未提交更改
git pull origin main   # 拉取最新代码
```

### Phase 2: 安装依赖

```bash
pnpm install           # 安装项目依赖
```

### Phase 3: 构建

```bash
pnpm build             # Next.js 生产构建
```

### Phase 4: 重启服务

```bash
pm2 restart v2note-gateway    # 重启网关服务
pm2 list                      # 显示服务状态
```

## 输出示例

```
✓ git pull 成功 (更新到 abc1234)
✓ pnpm install 成功 (789 个包)
✓ pnpm build 成功 (33.5s)
✓ pm2 restart 成功 (v2note-gateway, pid 184551)
```

## 注意事项

1. **本地更改**：如果有未提交的本地更改，会自动 stash，部署后保留在 stash 中
2. **构建失败**：如果构建失败，服务不会重启，保持旧版本运行
3. **依赖变更**：如果 package.json 有变化，必须完整执行 install
4. **PM2 进程名**：默认为 `v2note-gateway`，可在 ecosystem.config.js 中配置

## 故障排除

### 构建失败
```bash
# 查看详细错误
pnpm build --debug
```

### PM2 服务异常
```bash
# 查看日志
pm2 logs v2note-gateway

# 查看服务详情
pm2 show v2note-gateway
```

### 回滚
```bash
# 回退到上一个 commit
git reset --hard HEAD~1
pm2 restart v2note-gateway
```
