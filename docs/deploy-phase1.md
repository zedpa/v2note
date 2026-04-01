# Phase 1 并发优化 — 服务器部署指南

## 前置条件
- 阿里云 ECS 2核2G, 40G SSD
- 已有 PM2 管理 gateway 进程
- 已有 GitHub Actions 自动部署（但本次需要手动操作 Swap 和环境变量）

---

## 第一步：配置 Swap（5 分钟，只做一次）

SSH 到服务器后执行：

```bash
# 创建 2G swap 文件
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 开机自动挂载
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 优先用物理内存，紧张时才 swap
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

# 验证
free -h
# 应该能看到 Swap: 2.0G
```

## 第二步：创建缓存目录

```bash
# 创建磁盘缓存目录（embedding 持久缓存 + ASR 临时文件）
sudo mkdir -p /data/cache
sudo mkdir -p /data/tmp/asr
sudo chown -R $(whoami):$(whoami) /data
```

## 第三步：更新环境变量

编辑 gateway 的 .env 文件，新增两行：

```bash
cd ~/你的项目路径/gateway
nano .env
```

在文件末尾添加：

```env
# Phase 1 并发优化配置
CACHE_DIR=/data/cache
NO_CLUSTER=0
# 如需禁用 cluster（调试用），改为 NO_CLUSTER=1
# 如需指定 worker 数量，添加 CLUSTER_WORKERS=2
```

## 第四步：拉取代码并部署

```bash
cd ~/你的项目路径

# 拉取最新代码
git pull origin main

# 安装依赖（如果有新增）并构建
cd gateway
pnpm install --frozen-lockfile
pnpm build

# 重启服务（PM2 会自动管理 cluster 的 master 进程）
pm2 restart gateway
```

## 第五步：验证部署

```bash
# 1. 检查进程是否正常启动
pm2 logs gateway --lines 20
# 应该看到类似：
# [gateway] Primary 12345: forking 2 workers
# [gateway] Worker 12346: v2note Dialog Gateway on port 3001
# [gateway] Worker 12347: v2note Dialog Gateway on port 3001

# 2. 检查 health 接口
curl http://localhost:3001/health
# 应返回 {"status":"ok","timestamp":"..."}

# 3. 检查 swap 是否生效
free -h

# 4. 检查缓存目录
ls -la /data/cache/
# 首次请求后会自动创建 embeddings/ 子目录

# 5. 检查内存使用
pm2 monit
# 观察每个 worker 的内存占用
```

## 第六步：监控（上线后持续观察）

```bash
# 实时查看日志
pm2 logs gateway

# 查看进程状态
pm2 status

# 查看内存和 CPU
pm2 monit

# 查看 swap 使用情况
free -h

# 查看磁盘缓存大小
du -sh /data/cache/

# 查看 ASR 临时文件（应该很少，用完就删）
ls -la /data/tmp/asr/
```

---

## 注意事项

### Cluster 模式
- 代码默认启用 cluster，根据 CPU 核心数 fork worker（2核 = 2 worker）
- 每个 worker 独立的内存空间，session 不共享（Phase 2 引入 Redis 后解决）
- 同一个用户的 WebSocket 连接会固定在一个 worker 上（TCP 连接特性）
- 如果遇到问题，设置 `NO_CLUSTER=1` 回退到单进程模式

### 速率限制
- HTTP：每 IP 5 请求/秒，超限返回 429
- WebSocket：每设备 10 消息/秒，超限返回 error 消息
- 如果正常用户被限制，可以在 `rate-limit.ts` 中调大 `maxTokens`

### 磁盘缓存
- Embedding 缓存在 `/data/cache/embeddings/`，重启不丢失
- 缓存会随使用逐渐增长，10 万条约 400MB
- ASR 临时文件在 `/data/tmp/asr/`，录音结束后自动清理
- gateway 启动时会自动清理孤立的 ASR 临时文件

### 回滚方案
如果部署后有问题：

```bash
# 方案 A：禁用 cluster，回退到单进程
# 编辑 .env，添加 NO_CLUSTER=1
pm2 restart gateway

# 方案 B：回退到上一个版本
cd ~/你的项目路径
git log --oneline -5     # 找到上一个 commit hash
git checkout 上一个hash
cd gateway && pnpm build && pm2 restart gateway
```

---

## 改动摘要

| 优化项 | 效果 |
|--------|------|
| Swap 2G | 防 OOM，等效内存 2G→4G |
| Cluster 双核 | 吞吐量翻倍 |
| 连接池 10→15 + 超时 | 防连接耗尽和慢查询 |
| Semaphore 并发控制 | 防 DashScope 限速 |
| 速率限制 | 防恶意刷接口 |
| Embedding 磁盘缓存 | API 调用量减半，重启不丢缓存 |
| ASR 写磁盘 | 每录音省 ~1MB 内存 |
| Session 治理 | TTL 缩短 + 上限 30/worker |
| 检索合并 | DB 查询从 23 降至 5-8 条 |
