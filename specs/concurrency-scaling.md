---
id: "071"
title: "并发扩容方案（阿里云版）"
status: active
domain: infra
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-01
---
# 并发扩容方案（阿里云版）

> 状态：🔵 Phase 1 已实现

## 概述
200 个试用用户即将上线。当前 2核2G ECS + Supabase 免费版，稳定并发仅 3-5 人。
本方案基于阿里云生态 + 40G 本地磁盘，分三期将并发能力提升至支撑 200 用户日常使用。
核心策略：**用磁盘换内存、用磁盘换延迟、用代码换服务器**。

**用户量估算（200 注册用户）：**
- 日活 ~60 人（30%）
- 峰值同时在线 ~30-40 人
- 峰值同时发消息 ~8-15 人
- 峰值同时录音 ~3-5 人

## 现有资源

| 资源 | 用途 | 当前配置 |
|------|------|---------|
| ECS | gateway 运行 | 2核2G, **40G SSD** |
| DashScope | Qwen LLM / Embedding / ASR | qwen3-max, text-embedding-v3, fun-asr-realtime |
| OSS | 音频/文件存储 | cn-hangzhou, bucket: v2note |
| Supabase | PostgreSQL + pgvector | 免费版, Pooler 模式(端口 6543), **东京节点**(~50ms RTT) |

**磁盘空间规划（40G）：**

| 用途 | 分配 | 说明 |
|------|------|------|
| 系统 + Node.js + Python + 依赖 | ~10G | 已占用 |
| Swap 文件 | 2G | 防 OOM |
| Embedding SQLite 缓存 | 1G | 可存 10 万条向量 |
| ASR 音频临时文件 | 1G | 自动清理 |
| 音频 OSS 上传暂存队列 | 5G | 上传后删除 |
| Soul/Profile 磁盘缓存 | 100MB | 200 用户 × 几KB |
| **剩余可用** | **~21G** | 充足 |

## 现状瓶颈摘要

| 组件 | 现状 | 瓶颈 |
|------|------|------|
| Node.js 进程 | 单线程，无 cluster | 2 核只用 1 核 |
| DB 连接池 | max: 10 | 3 人聊天即可耗尽 |
| Session 存储 | 内存 Map，无上限 | 每 session 峰值 ~100MB，15 session = OOM |
| Chat 响应 | `fullResponse += chunk` 全量累积 | 内存随对话增长 |
| Embedding 缓存 | 内存 Map 500 条，重启丢失 | 重启后冷启动大量 DashScope 调用 |
| Embedding 搜索 | 每次聊天触发，无并发控制 | 3 人同时 = 150+ DashScope 调用 |
| 检索通道 | 6 通道最多 23 条独立查询 | 并发检索耗尽连接池 |
| Proactive Engine | 主线程 4 个 setInterval | 定时任务阻塞请求处理 |
| 速率限制 | 无 | 无任何防护 |
| ASR 音频缓冲 | Buffer[] 内存累积，无上限 | 长录音内存爆炸 |
| Supabase | 东京节点, ~50ms RTT | 每次聊天 5-8 次查询额外 250-400ms |
| DashScope | 无客户端限流 | 并发 AI 调用无上限，易被平台限速 |

---

## Phase 1: 代码优化 + 磁盘利用（零成本，目标 30-50 并发）

> 纯代码改动 + 服务器 swap 配置，不增加任何付费服务。

### 场景 1.0: Swap 文件（运维操作，非代码）
```
假设 (Given)  ECS 仅 2G 内存，40G 磁盘大量闲置
当   (When)   创建 2G swap 文件
那么 (Then)   等效可用内存从 2G 扩展到 4G
并且 (And)    OOM 风险从 "15 session 必崩" 降为 "30+ session 才开始变慢"
并且 (And)    swappiness 设为 10（优先用物理内存，紧张时才 swap）
```

**服务器执行：**
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
```

### 场景 1.1: Embedding 磁盘持久缓存（SQLite）
```
假设 (Given)  embedding 缓存在内存 Map，500 条上限，重启丢失
当   (When)   改为 SQLite 磁盘缓存 + 内存 LRU 热层
那么 (Then)   磁盘层可存 10 万条 embedding（~400MB），重启不丢失
并且 (And)    内存只保留最近 100 条热点（LRU），从 4MB 降到 ~0.8MB
并且 (And)    磁盘读取延迟 ~0.1ms，远低于远程 DashScope 请求的 ~100ms
并且 (And)    DashScope embedding 调用量减少 50%+（缓存命中）
```

**实现要点：**
```typescript
// gateway/src/lib/disk-cache.ts（新增）
import Database from 'better-sqlite3';

const CACHE_DIR = process.env.CACHE_DIR ?? '/data/cache';
const db = new Database(`${CACHE_DIR}/embeddings.db`);

db.exec(`CREATE TABLE IF NOT EXISTS embeddings (
  key TEXT PRIMARY KEY,
  vector BLOB NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
)`);

const getStmt = db.prepare('SELECT vector FROM embeddings WHERE key = ?');
const putStmt = db.prepare('INSERT OR REPLACE INTO embeddings (key, vector) VALUES (?, ?)');

export function getCachedEmbedding(key: string): number[] | null {
  const row = getStmt.get(key) as { vector: Buffer } | undefined;
  if (!row) return null;
  return Array.from(new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4));
}

export function setCachedEmbedding(key: string, vector: number[]): void {
  const buf = Buffer.from(new Float32Array(vector).buffer);
  putStmt.run(key, buf);
}
```

```typescript
// gateway/src/memory/embeddings.ts 改造
// 查找顺序：内存 LRU(100) → SQLite 磁盘 → DashScope 远程 → 回写两层
```

**依赖：** `pnpm add better-sqlite3`（gateway workspace）

### 场景 1.2: ASR 音频写磁盘（替代内存 Buffer[]）
```
假设 (Given)  ASR audioChunks: Buffer[] 在内存累积，30s 录音 ≈ 960KB
当   (When)   改为流式写入磁盘临时文件
那么 (Then)   每个 ASR session 内存占用从 ~1MB 降至 ~1KB（仅保留文件句柄）
并且 (And)    5 人同时录音：省 ~5MB 内存
并且 (And)    录音结束后直接用文件路径调用 Python 转写（无需拼接 Buffer）
并且 (And)    转写完成后自动删除临时文件
并且 (And)    单次录音上限 120 秒（超限自动停止并返回已有结果）
```

**实现要点：**
```typescript
// gateway/src/handlers/asr.ts 改造
import { createWriteStream, unlinkSync } from 'node:fs';

interface ASRSession {
  // ...原有字段
  audioFile: string;           // 替代 audioChunks: Buffer[]
  audioStream: fs.WriteStream; // 流式写入
  audioBytes: number;          // 已写入字节数
}

const MAX_AUDIO_BYTES = 120 * 16000 * 2; // 120s × 16kHz × 16bit = ~3.8MB

// 收到音频 chunk 时
audioStream.write(chunk);
session.audioBytes += chunk.length;
if (session.audioBytes >= MAX_AUDIO_BYTES) {
  // 自动停止，返回已有结果
}
```

**磁盘路径：** `/data/tmp/asr/{taskId}.pcm`，转写后删除。

### 场景 1.3: Soul/Profile 磁盘缓存（减少 Supabase RTT）
```
假设 (Given)  每次聊天都查 Supabase 取 soul/profile，RTT ~50ms × 2 = 100ms
当   (When)   加入两级缓存：内存(5min) → 磁盘(1h) → Supabase
那么 (Then)   soul/profile 缓存命中率 ~95%
并且 (And)    命中时延迟从 50ms 降至 0.1ms
并且 (And)    写入时同步更新缓存（write-through）
并且 (And)    每用户缓存文件 ~2KB，200 用户 = 400KB 磁盘
```

**实现要点：**
```typescript
// gateway/src/lib/file-cache.ts（新增）
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';

const CACHE_DIR = process.env.CACHE_DIR ?? '/data/cache';

export function fileCache<T>(namespace: string, ttlMs: number) {
  const dir = `${CACHE_DIR}/${namespace}`;
  mkdirSync(dir, { recursive: true });

  return {
    get(key: string): T | null {
      const file = `${dir}/${key}.json`;
      try {
        const stat = statSync(file);
        if (Date.now() - stat.mtimeMs > ttlMs) return null;
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch { return null; }
    },
    set(key: string, value: T): void {
      writeFileSync(`${dir}/${key}.json`, JSON.stringify(value));
    },
    invalidate(key: string): void {
      try { unlinkSync(`${dir}/${key}.json`); } catch {}
    }
  };
}

// 使用：
// const soulCache = fileCache<Soul>('soul', 60 * 60 * 1000);
// const profileCache = fileCache<Profile>('profile', 60 * 60 * 1000);
```

### 场景 1.4: 音频 OSS 异步上传（磁盘暂存队列）
```
假设 (Given)  录音结束后同步上传 OSS，上传期间用户等待
当   (When)   改为先写本地磁盘，异步上传
那么 (Then)   录音结束立即返回成功（本地文件路径）
并且 (And)    后台队列异步上传 OSS
并且 (And)    上传成功后删除本地文件，更新数据库 URL
并且 (And)    上传失败自动重试 3 次（指数退避）
并且 (And)    暂存目录 /data/audio-queue/，保留最多 5G
```

**实现要点：**
```typescript
// gateway/src/storage/upload-queue.ts（新增）
const QUEUE_DIR = '/data/audio-queue';

interface UploadTask {
  localPath: string;
  ossPath: string;
  recordId: string;
  retries: number;
  createdAt: number;
}

// 简单文件队列：每个任务一个 .json 文件
// 后台 setInterval 每 5 秒扫描队列目录，处理上传
// 上传成功 → 删除本地 WAV + 任务文件
// 上传失败 → retries++，下次重试
// retries > 3 → 移入 failed/ 子目录，报警
```

### 场景 1.5: 数据库连接池扩容 + 超时保护
```
假设 (Given)  DB 连接池 max=10，无超时配置
当   (When)   修改连接池配置
那么 (Then)   max 提升到 15（Supabase Pooler 模式下可支撑更多）
并且 (And)    增加 connectionTimeoutMillis: 5000（等连接超时）
并且 (And)    增加 statement_timeout: 10000（单查询超时）
```

**改动文件：** `gateway/src/db/pool.ts`（改 3 行）

### 场景 1.6: DashScope 调用并发控制
```
假设 (Given)  DashScope API 有隐性 QPS 限制（embedding ~10 QPS，LLM ~5-10 QPS）
当   (When)   加入 Semaphore 并发控制
那么 (Then)   embedding 调用全局最多 5 个同时请求，超出排队
并且 (And)    LLM chat 全局最多 3 个同时请求，超出排队
并且 (And)    默认用 keyword 搜索，仅在结果 < 3 条时 fallback 到 embedding
```

**新增文件：** `gateway/src/lib/semaphore.ts`（~30 行）
**改动文件：** `gateway/src/memory/embeddings.ts`、`gateway/src/ai/provider.ts`

### 场景 1.7: 请求级速率限制
```
假设 (Given)  gateway 无任何速率限制
当   (When)   加入基于 deviceId 的令牌桶限流
那么 (Then)   每设备每秒最多 5 个 HTTP 请求
并且 (And)    超限返回 429 Too Many Requests
并且 (And)    WebSocket 消息限制为每设备每秒 10 条
```

**新增文件：** `gateway/src/middleware/rate-limit.ts`（~40 行）

### 场景 1.8: Session 内存治理
```
假设 (Given)  Session 使用内存 Map，TTL 30 分钟，无上限
当   (When)   优化 session 管理策略
那么 (Then)   TTL 缩短到 10 分钟
并且 (And)    单 worker 最大 session 数限制为 30
并且 (And)    超限时淘汰最久未活跃的 session
并且 (And)    MemoryManager 按需加载，不在 session 创建时预加载 embedding
```

**改动文件：** `gateway/src/session/manager.ts`

### 场景 1.9: Node.js Cluster 双核利用
```
假设 (Given)  ECS 有 2 个 CPU 核心，当前只用 1 个
当   (When)   gateway 启动时
那么 (Then)   使用 node:cluster 启动 2 个 worker 进程
并且 (And)    master 进程仅负责 fork/restart，不处理请求
并且 (And)    WebSocket 连接通过 sticky session（基于 deviceId hash）分配到固定 worker
```

**改动文件：** `gateway/src/index.ts`

### 场景 1.10: 检索通道合并查询
```
假设 (Given)  retrieval 6 个通道最多 23 条独立 SQL 查询
当   (When)   合并查询逻辑
那么 (Then)   semantic + polarity 共用一次 embedding 计算
并且 (And)    tag + person + cluster 合并为一条 UNION 查询
并且 (And)    总查询数从 23 降至 5-8
```

**改动文件：** `gateway/src/cognitive/retrieval.ts`

---

## Phase 2: 阿里云服务引入（~¥150/月，目标 80-100 并发）

> 引入阿里云 Redis + ECS 小幅升配，解决跨进程共享和内存瓶颈。

### 场景 2.1: 阿里云 Redis（Tair）引入
```
假设 (Given)  Phase 1 完成，瓶颈转移到跨 worker 共享和内存
当   (When)   购买阿里云 Redis 社区版（256MB，按量付费）
那么 (Then)   Session 存储迁移到 Redis（解决 cluster 跨 worker 问题）
并且 (And)    Soul/Profile 缓存从磁盘层升级到 Redis（TTL 30 分钟）
并且 (And)    embedding 热点缓存迁到 Redis（SQLite 磁盘层保留做冷缓存）
并且 (And)    长任务（digest/batch-analyze）通过 BullMQ + Redis 队列化
```

**阿里云 Redis 选型：**
| 规格 | 价格 | 适用场景 |
|------|------|---------|
| 社区版 256MB（按量） | ~¥0.08/小时 ≈ ¥58/月 | 200 用户足够 |
| 社区版 1GB（包年包月） | ~¥78/月 | 留余量，推荐 |

> 选同地域（cn-hangzhou）同 VPC，内网访问延迟 < 1ms。

### 场景 2.2: ECS 升配到 2核4G
```
假设 (Given)  当前 2核2G + 2G swap，Node.js 两个 worker 内存偏紧
当   (When)   ECS 升配到 2核4G（原地升级，停机 < 5 分钟）
那么 (Then)   每 worker 可用内存从 ~800MB 提升到 ~1.5GB
并且 (And)    swap 使用率大幅降低，性能更稳定
并且 (And)    可稳定支撑 30 个活跃 session / worker
```

**阿里云 ECS 选型：**
| 规格 | 价格（包年包月） | 备注 |
|------|----------------|------|
| ecs.t6-c1m2.large 2核4G | ~¥90/月 | 突发型，适合试用期 |
| ecs.c7.large 2核4G | ~¥150/月 | 计算型，更稳定 |

### 场景 2.3: Proactive Engine 拆离主进程
```
假设 (Given)  Proactive Engine 的 4 个 setInterval 运行在主线程
当   (When)   拆为独立进程
那么 (Then)   使用 node:child_process.fork() 启动独立 proactive worker
并且 (And)    通过 Redis pub/sub 与主进程通信
并且 (And)    主进程释放定时任务的 CPU 和内存开销
```

### 场景 2.4: DashScope 调用熔断
```
假设 (Given)  DashScope API 偶发超时或限速
当   (When)   加入熔断机制
那么 (Then)   连续 3 次超时后触发熔断，30 秒内降级响应
并且 (And)    chat 超时从 180s 降至 60s
并且 (And)    process 超时从 300s 降至 90s
并且 (And)    熔断状态通过 Redis 共享给所有 worker
```

### 场景 2.5: 缓存架构统一
```
假设 (Given)  Phase 1 的磁盘缓存在 cluster 模式下各 worker 独立
当   (When)   引入 Redis 后统一缓存架构
那么 (Then)   三级缓存：内存 LRU → Redis → SQLite 磁盘(仅 embedding) → 数据源
并且 (And)    写入时 write-through 所有层
并且 (And)    Soul/Profile 缓存走 Redis（跨 worker 共享）
并且 (And)    Embedding 缓存走 Redis 热层 + SQLite 冷层（10 万条持久化）
```

---

## Phase 3: 规模化（~¥400-600/月总成本，目标 200 并发）

> 当用户量超过 200 或需要更高可用性时执行。

### 场景 3.1: ECS 升级到 4核8G
```
假设 (Given)  Phase 2 完成，用户持续增长
当   (When)   升级 ECS 到 4核8G
那么 (Then)   Node.js cluster 启动 4 个 worker
并且 (And)    每 worker 可承载 50 个活跃 session
并且 (And)    总计支持 200 并发 session
```

**阿里云 ECS 选型：**
| 规格 | 价格（包年包月） | 备注 |
|------|----------------|------|
| ecs.c7.xlarge 4核8G | ~¥280/月 | 推荐 |
| ecs.g7.xlarge 4核16G | ~¥400/月 | 留更多余量 |

### 场景 3.2: Supabase → 阿里云 RDS（可选）
```
假设 (Given)  Supabase 免费版限制成为瓶颈（500MB 数据 / 东京延迟）
当   (When)   迁移到阿里云 RDS PostgreSQL
那么 (Then)   购买 RDS PostgreSQL 基础版 2核4G（~¥200/月）
并且 (And)    启用 pgvector 扩展（阿里云 RDS PG 14+ 原生支持）
并且 (And)    数据库与 ECS 同 VPC，延迟从 ~50ms 降至 <1ms
并且 (And)    连接数上限 200+，无服务级限流
```

**迁移方案：**
```
1. pg_dump 从 Supabase 导出
2. psql 导入阿里云 RDS
3. 修改 gateway/.env 的 RDS_HOST/RDS_PORT 等
4. 验证 pgvector 扩展：CREATE EXTENSION IF NOT EXISTS vector;
5. 切换连接串，验证功能
```

### 场景 3.3: 阿里云 SLB + 多实例（200+ 并发）
```
假设 (Given)  单机达到性能天花板
当   (When)   部署多实例
那么 (Then)   使用阿里云 SLB（负载均衡）做 L7 分发
并且 (And)    WebSocket 通过 Redis pub/sub 跨实例广播
并且 (And)    Session 全在 Redis，实例无状态
并且 (And)    水平扩展到 2 台 ECS
```

---

## 阿里云全家桶成本汇总

### 试用期推荐方案（200 用户）

| 阶段 | 阿里云服务 | 月成本 | 支撑并发 |
|------|-----------|--------|---------|
| **Phase 1**（立即） | 现有 2核2G ECS + 代码优化 + 磁盘利用 | ¥0 新增 | 30-50 |
| **Phase 2**（用户反馈后） | ECS 升 2核4G + Redis 256MB | +¥150/月 | 80-100 |
| **Phase 3**（用户增长后） | ECS 升 4核8G + Redis 1GB | +¥360/月 | 200 |

### Phase 3 全栈成本明细

| 服务 | 规格 | 月费 |
|------|------|------|
| ECS | ecs.c7.xlarge 4核8G | ¥280 |
| Redis（Tair） | 社区版 1GB | ¥78 |
| OSS | 已有，存储按量 | ~¥5 |
| DashScope | 按量（qwen3-max） | ~¥100-300 |
| Supabase 免费版 | 保持不变 | ¥0 |
| **总计** | | **¥463-663/月** |

---

## DashScope API 用量预估（200 用户）

| 操作 | 单次 token | 日均次数 | 月费用 |
|------|-----------|---------|--------|
| 聊天（qwen3-max） | ~2500 | 300 次 | ~¥45 |
| Digest 处理 | ~4000 | 100 次 | ~¥24 |
| Voice action 分类 | ~600 | 200 次 | ~¥7 |
| Embedding | ~200 | 500 次 | ~¥3 |
| ASR 语音识别 | ¥0.006/秒 | 100次×30s | ~¥18 |
| **月合计** | | | **~¥97/月** |

> DashScope 新用户有免费额度，前 1-2 个月可能不花钱。

---

## 执行计划

### Phase 1 执行顺序（按依赖关系编排）

```
第一批：基础设施 + 独立模块（无依赖，可并行）
  ├── 1.0  Swap 文件（运维，SSH 执行 5 条命令）
  ├── 1.5  连接池扩容 + 超时（改 pool.ts 3 行）
  ├── 1.6  Semaphore 工具类（新增 semaphore.ts）
  └── 1.7  速率限制中间件（新增 rate-limit.ts）

第二批：磁盘缓存层（依赖目录结构初始化）
  ├── 1.1  Embedding SQLite 缓存（新增 disk-cache.ts，改 embeddings.ts）
  ├── 1.3  Soul/Profile 磁盘缓存（新增 file-cache.ts，改 soul/profile 查询层）
  └── 1.2  ASR 音频写磁盘（改 asr.ts）

第三批：调用链优化（依赖 Semaphore）
  ├── 1.6  DashScope 并发控制（改 embeddings.ts, provider.ts，接入 Semaphore）
  └── 1.10 检索通道合并（改 retrieval.ts）

第四批：会话层改造
  ├── 1.8  Session 治理（改 manager.ts）
  └── 1.4  音频 OSS 异步上传（新增 upload-queue.ts，改 asr.ts）

第五批：进程模型（最后做，影响面最大）
  └── 1.9  Node.js Cluster（改 index.ts）
```

### 改动文件清单（Phase 1）

| 文件 | 操作 | 场景 |
|------|------|------|
| `gateway/src/lib/semaphore.ts` | 新增 | 1.6 |
| `gateway/src/lib/disk-cache.ts` | 新增 | 1.1 |
| `gateway/src/lib/file-cache.ts` | 新增 | 1.3 |
| `gateway/src/middleware/rate-limit.ts` | 新增 | 1.7 |
| `gateway/src/storage/upload-queue.ts` | 新增 | 1.4 |
| `gateway/src/db/pool.ts` | 改 3 行 | 1.5 |
| `gateway/src/memory/embeddings.ts` | 改造缓存层 | 1.1, 1.6 |
| `gateway/src/handlers/asr.ts` | Buffer[]→磁盘 | 1.2 |
| `gateway/src/session/manager.ts` | TTL+上限 | 1.8 |
| `gateway/src/ai/provider.ts` | 接入 Semaphore | 1.6 |
| `gateway/src/cognitive/retrieval.ts` | 合并查询 | 1.10 |
| `gateway/src/index.ts` | cluster 模式 | 1.9 |
| `gateway/package.json` | 加 better-sqlite3 | 1.1 |

## 边界条件
- [ ] better-sqlite3 需要 node-gyp 编译环境（ECS 上需 `yum install gcc-c++ make`）
- [ ] /data/cache 和 /data/tmp 目录需在部署时创建并设权限
- [ ] SQLite 在 cluster 多 worker 下并发写安全（better-sqlite3 同步 API，单进程内安全；跨进程需 WAL 模式）
- [ ] 磁盘缓存文件损坏时的降级（直接跳过缓存，走数据源）
- [ ] ASR 临时文件清理：进程异常退出时的孤立文件回收（启动时清理 /data/tmp/asr/）
- [ ] 音频上传队列：进程重启后恢复未完成的上传任务
- [ ] cluster 模式下 WebSocket sticky session 正确性
- [ ] DashScope embedding QPS 限制（实测约 10-20 QPS）
- [ ] DashScope qwen3-max 并发限制（实测约 5-10 并发流）
- [ ] 大量 WebSocket 断线重连时的雪崩效应
- [ ] ECS 突发型实例（t6）CPU 积分耗尽后降频

## 依赖
- node:cluster（Node.js 内置）
- better-sqlite3（npm，embedding 磁盘缓存）
- ioredis（Phase 2，连接阿里云 Redis）
- BullMQ（Phase 2，已在 proactive engine 中部分使用）
- ali-oss（已在使用）

## 备注
- Phase 1 第一、二批改动互相独立，可并行开发
- **最高 ROI**：Swap(1.0) + 连接池(1.5) + DashScope 并发控制(1.6) + 速率限制(1.7)，半天搞定，并发从 5 提到 20-30
- 磁盘缓存(1.1, 1.3)是 Phase 2 Redis 的过渡方案，引入 Redis 后热层迁移到 Redis，SQLite 冷层保留
- Cluster(1.9) 放最后做，因为影响面最大且需要测试 WebSocket sticky session
- 试用期建议 Phase 1 上线后观察 1 周监控数据，再决定是否需要 Phase 2
