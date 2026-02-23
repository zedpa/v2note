# v2note

v2note 是一个语音优先的笔记与行动管理项目：前端负责录音、展示与交互，`gateway` 负责 ASR/AI 处理、结构化提取与主动提醒，数据落到 PostgreSQL。

## 核心能力

- 语音录制 + 实时 ASR 转写（WebSocket 二进制 PCM）
- AI 结构化提取（todos / customer requests / setting changes / tags / summary）
- 命令系统（文本与语音统一触发 `/todos`、`/review` 等）
- 待办时间估算与今日甘特排程
- 主动提醒（`proactive.message` / `proactive.todo_nudge`）
- 本地配置优先（soul / skills / settings / tools），支持离线与同步

## 技术架构

- App（Next.js + React + Capacitor）
- Gateway（Node.js + TypeScript + ws + pg）
- DB（PostgreSQL，SQL 在 `gateway/schema.sql` 与 `supabase/migrations/`）
- AI/ASR（DashScope 兼容接口）
- 可选 MCP 工具接入（Gateway 作为 MCP Client）

关键入口：

- 前端入口：`app/page.tsx`
- 网关入口：`gateway/src/index.ts`
- AI 处理入口：`gateway/src/handlers/process.ts`
- 主动提醒前端监听：`features/proactive/components/nudge-toast.tsx`
- 功能基因文档：`docs/genes.MD`

## 项目结构

```text
v2note/
├─ app/                    # Next.js App Router 页面入口
├─ features/               # 业务功能模块（notes/todos/review/skills/proactive 等）
├─ shared/                 # 通用组件、API、存储、本地配置
├─ gateway/                # 独立 Node 网关服务（WS + REST + AI + DB）
│  ├─ src/                 # 网关源码（handlers/routes/mcp/proactive/db）
│  ├─ skills/              # 网关技能定义
│  ├─ schema.sql           # 基础数据库结构
│  └─ .env.example         # 网关环境变量模板
├─ supabase/
│  ├─ migrations/          # 迁移 SQL（001~007）
│  └─ functions/           # 历史/补充 edge functions
├─ docs/
│  ├─ genes.MD             # 功能基因库（模块描述与关键文件）
│  └─ plans/               # 方案/计划文档
└─ scripts/                # 测试或辅助脚本
```

## 快速开始

### 1. 环境准备

- Node.js 20+
- pnpm 8+
- PostgreSQL 14+

### 2. 安装依赖

```bash
pnpm install
cd gateway && pnpm install
```

### 3. 配置环境变量

前端（根目录 `.env.local`）：

```env
NEXT_PUBLIC_GATEWAY_URL=ws://localhost:3001
```

网关（`gateway/.env`，可由 `gateway/.env.example` 复制）：

```env
RDS_HOST=localhost
RDS_DATABASE=v2note
RDS_USER=postgres
RDS_PASSWORD=your-password
RDS_PORT=5432
RDS_SSL=false

DASHSCOPE_API_KEY=your-dashscope-api-key
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus
GATEWAY_PORT=3001
```

可选 OSS（音频存储）：

```env
OSS_REGION=...
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_BUCKET=...
```

### 4. 初始化数据库

按顺序执行：

1. `gateway/schema.sql`
2. `supabase/migrations/001_initial_schema.sql` 到 `supabase/migrations/007_time_management.sql`

### 5. 启动服务

终端 A（网关）：

```bash
pnpm gateway
```

终端 B（前端）：

```bash
pnpm dev
```

访问：

- Web: `http://localhost:3000`
- Gateway Health: `http://localhost:3001/health`
- Gateway REST: `http://localhost:3001/api/v1/`
- Gateway WS: `ws://localhost:3001`

## 常用命令（应用内）

来自 `features/commands/lib/commands.json`：

- `/todos` 待办日记卡
- `/today-todo` 今日甘特图
- `/review` 复盘对话
- `/search` 搜索笔记
- `/skills` 技能管理
- `/stats` 统计看板
- `/profile` AI 画像编辑
- `/settings` 设置编辑
- `/ideas` 灵感列表
- `/memory` 记忆查看
- `/help` 帮助

## 开发脚本

根目录 `package.json`：

- `pnpm dev` 启动前端开发环境
- `pnpm build` 前端构建
- `pnpm start` 前端生产启动
- `pnpm lint` 代码检查
- `pnpm cap:sync` 构建并同步 Capacitor
- `pnpm cap:android` 打开 Android 工程
- `pnpm cap:ios` 打开 iOS 工程
- `pnpm gateway` 启动网关开发模式

网关 `gateway/package.json`：

- `pnpm dev`（在 `gateway/` 下）启动 `tsx watch`
- `pnpm build` 编译 TS
- `pnpm start` 运行 `dist/index.js`

## 参考文档

- 功能基因：`docs/genes.MD`
- 架构图：`architecture.svg`
