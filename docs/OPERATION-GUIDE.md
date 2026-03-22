# v2note 念念有路 — 操作说明

> 版本：2026-03-22
> 品牌：念念有路 · v2note · 路路 🦌

---

## 环境准备

### 数据库 Migration

```bash
cd gateway

# 017: 认知层四表（strike/bond/strike_tag/cluster_member + record.digested）
node scripts/run-migration.mjs ../supabase/migrations/017_cognitive_layer.sql

# 018: source_type 字段（think/material）
node scripts/run-migration.mjs ../supabase/migrations/018_source_type.sql

# 验证
node scripts/verify-tables.mjs
```

### 启动服务

```bash
# 终端 1: Gateway
cd gateway && npx tsx src/index.ts
# 应看到:
# [gateway] v2note Dialog Gateway running on port 3001
# [proactive] Cognitive digest fallback timer (3h)
# [proactive] Cognitive daily cycle (24h)
# [proactive] Weekly emergence (7d)

# 终端 2: 前端
npx next dev
# http://localhost:3000
```

### Seed 测试数据（可选）

```bash
cd gateway
node scripts/seed-test-strikes.mjs    # 基础 Strike 数据
node scripts/seed-cluster.mjs         # 创建 Cluster
node scripts/seed-cluster-rich.mjs    # 补充矛盾/模式/目标数据
```

---

## 系统架构

### 数据流

```
输入（任何来源）
    ↓
POST /api/v1/ingest（统一入口）
    ↓
Record + Transcript + Summary 入库
    ↓
Digest 管道（Strike 拆解 + Bond 建立）
    ↓
3h Cron 批量消化 / 深度内容立即触发
    ↓
每日凌晨 3 点: 聚类 → 矛盾扫描 → 融合 → 维护
    ↓
每周日凌晨 4 点: 涌现（跨 Cluster + 认知模式提炼）
```

### 认知引擎三层

| 层级 | 频率 | 做什么 |
|------|------|--------|
| Level 1 Digest | 3h / 即时 | Strike 拆解 + Bond + 跨记录关联 |
| Level 2 Daily | 每日 3am | 聚类 + 矛盾扫描 + Promote + 维护 |
| Level 3 Weekly | 每周日 4am | 涌现 + 认知模式 + 共振 |

---

## 多模态输入

### 统一 API

所有输入通过一个端点：

```bash
POST /api/v1/ingest
Content-Type: application/json

# 文本
curl -X POST http://localhost:3001/api/v1/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"text","content":"张总说铝价涨了","source_type":"think"}'

# URL 导入
curl -X POST http://localhost:3001/api/v1/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"url","content":"https://example.com/article","source_type":"material"}'

# 图片（base64）
curl -X POST http://localhost:3001/api/v1/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"image","file_base64":"data:image/png;base64,...","source_type":"material"}'

# 文件（base64）
curl -X POST http://localhost:3001/api/v1/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"file","file_base64":"...","filename":"report.pdf","mimeType":"application/pdf"}'
```

### CLI 工具

```bash
node bin/v2note-cli.mjs "今天开会讨论了供应链问题"
node bin/v2note-cli.mjs --url https://example.com/article
echo "meeting notes" | node bin/v2note-cli.mjs
node bin/v2note-cli.mjs --gateway http://your-server:3001 "content"
```

### MCP 集成

外部 Agent（Claude Desktop、Cursor、OpenClaw 等）可通过 MCP 协议调用 `ingest` 工具：

```json
{
  "name": "ingest",
  "arguments": {
    "text": "张总说铝价涨了15%",
    "source_type": "think"
  }
}
```

### source_type 说明

| 类型 | 标签 | 认知权重 | 默认场景 |
|------|------|---------|---------|
| `think` | 🧠 Think | 完整（参与涌现/目标/回顾） | 用户打字、语音 |
| `material` | 📎 素材 | 降级 1/5~1/10 | 文件、图片、URL、粘贴长文本 |

用户可在日记卡片上一键切换：`PATCH /api/v1/records/:id/source-type`

---

## PC 端（四场景）

### 场景切换

| 场景 | URL | 快捷键 | 说明 |
|------|-----|--------|------|
| 写作 | /write | Esc | 默认，纯净输入面板 |
| 时间线 | /timeline | Ctrl+1 | 三栏浏览日记 |
| 认知地图 | /map | Ctrl+2 | 网状图/思维导图 |
| 目标 | /goals | Ctrl+3 | 项目→目标→行动 |

### 菜单栏

鼠标移到屏幕顶部 48px 区域自动滑入，离开 400ms 后淡出。

左侧：路路 Logo + "念念有路" + 四场景按钮
右侧：🔍搜索 + 🎙语音 + ⚡️行动 + 📋回顾 + ⚙️设置

### 写作面板（/write）

- 全屏居中 680px，等距字体，行高 2 倍
- `/` 行首：命令面板（13 个命令 + Markdown 语法）
- `@`：链接到主题/目标
- `#`：添加标签（#+空格 = Markdown 标题）
- Ctrl+Enter：提交 → "✓ 路路收到了"
- Ctrl+S：暂存草稿（自动保存每 30s）
- 拖放/粘贴：图片、URL、文件自动识别并上传
- 粘贴长文本(≥100字)：弹出"作为素材导入？"确认

### 时间线（/timeline）

- 左栏 200px：主题树导航（点击筛选 + 右键重命名/合并/删除 + 拖拽归类）
- 中栏：日记卡片流（头像+时间+输入方式 → 原文 → 标签+关联数）
- 右栏 320px：点击日记后展开（原文+语音回放+附件+相关记录+所属主题+💬路路入口）
- 筛选：全部/语音/文字/图片/带文件 + 日期范围

### 认知地图（/map）

- 网状图：Cluster 节点 + Bond 连线，语义缩放（双击展开为日记卡片群）
- 思维导图：树形层级（项目→目标→主题→日记数）
- 拖线连接：创建手动 Bond
- 右栏 320px：节点详情（概览+目标+最近记录+关联主题）

### 目标（/goals）

- 项目卡片（bg-sand）→ 目标卡片（白底）→ 行动 checkbox
- 目标健康度：四要素进度条（方向/资源/路径/驱动）
- 认知叙事：起点→转折→冲突→悬念（引用日记原文）
- 跳过标记：maple 色 "跳过N次" 标签
- 未归属目标区：涌现出但未归入项目的目标

### 浮层

| 浮层 | 触发 | 类型 |
|------|------|------|
| ⚡️ 行动队列 | 菜单栏按钮 | 右侧边栏 320px |
| 📋 每日回顾 | 菜单栏按钮 | 居中弹窗 620px |
| 🔍 全局搜索 | Ctrl+K | 居中弹窗 520px |
| 💬 参谋对话 | 各处"和路路聊聊"按钮 | 内嵌在触发位置 |

---

## 移动端

### 默认态（Level -1）

暖奶色背景 + 大时间 + 日期 + 录音 FAB。极简，不干扰思考。

### 统一输入框

FAB 点击弹出底部输入框：
- 📎 左侧：附件（拍照/相册/文件）
- 中间：文本输入 + URL 自动检测预览
- 🎙 右侧：切换到独立录音界面

### 行动面板

底部上滑呼出：
- 此刻卡片（右滑完成 / 左滑分叉跳过）
- 今日行动线（●下一个 ○计划 ◇灵活）
- 目标指示器（底部圆点切换）
- 长按穿越到认知地图

### 认知地图

Brain 🧠 图标进入 → Cluster 卡片墙 → 点击展开（模式/矛盾/目标/时间线）

---

## API 参考

### 核心 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/ingest` | POST | 统一输入入口（text/image/file/url/audio） |
| `/api/v1/records/:id/source-type` | PATCH | 切换 Think ↔ Material |
| `/api/v1/action-panel` | GET | 行动面板数据 |
| `/api/v1/action-panel/swipe` | POST | 记录滑动行为 |

### 认知 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/cognitive/stats` | GET | 认知统计 |
| `/api/v1/cognitive/clusters` | GET | Cluster 列表 |
| `/api/v1/cognitive/clusters/:id` | GET | Cluster 详情 |
| `/api/v1/cognitive/bonds` | POST | 手动创建 Bond |

### Strike API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/records/:id/strikes` | GET | 某记录的 Strike 列表 |
| `/api/v1/strikes/:id` | PATCH | 修改 Strike |
| `/api/v1/strikes/:id/trace` | GET | 溯源链 |

### 决策 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/chat/decision` | POST | 决策分析 |

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+K | 全局搜索 |
| Ctrl+Enter | 提交日记 |
| Ctrl+S | 暂存草稿 |
| Ctrl+Space | 语音开关 |
| Ctrl+1/2/3 | 时间线/地图/目标 |
| Ctrl+D | 每日回顾 |
| Esc | 关闭浮层/回到写作 |
| / | 命令面板 |
| @ | 链接到结构 |
| # | 添加标签 |
| Tab | 涌现结构面板（写作中） |

---

## 后台定时任务

| 任务 | 频率 | 说明 |
|------|------|------|
| Digest 批量 | 每 3 小时 | 消化 undigested 记录 |
| Daily Cycle | 每天 3am | 聚类→矛盾→融合→维护→告警 |
| Weekly Emergence | 每周日 4am | 跨 Cluster + 模式提炼 |

---

## 文件结构

### 认知引擎（后端）

```
gateway/src/
├── ai/
│   ├── provider.ts          # AI 调用封装
│   └── vision.ts            # Vision LLM 图片描述
├── cognitive/
│   ├── action-panel.ts      # 行动面板计算
│   ├── alerts.ts            # 矛盾推送
│   ├── clustering.ts        # Level 2 聚类
│   ├── contradiction.ts     # 矛盾扫描
│   ├── daily-cycle.ts       # 每日编排
│   ├── decision.ts          # 决策分析
│   ├── emergence.ts         # Level 3 涌现
│   ├── maintenance.ts       # 归一化+衰减
│   ├── promote.ts           # 融合 Promote
│   ├── retrieval.ts         # 混合检索
│   └── swipe-tracker.ts     # 滑动追踪
├── handlers/
│   ├── digest.ts            # Digest Level 1 管道
│   ├── digest-prompt.ts     # Digest prompt
│   └── process.ts           # Process（精简版，仅文本优化）
├── ingest/
│   ├── file-parser.ts       # PDF/Word/Excel 解析
│   └── url-extractor.ts     # URL 提取
├── routes/
│   ├── ingest.ts            # 统一输入 API
│   ├── action-panel.ts      # 行动面板 API
│   ├── cognitive-clusters.ts # Cluster API
│   ├── cognitive-stats.ts   # 认知统计 API
│   └── strikes.ts           # Strike API
└── tools/
    └── builtin.ts           # 内置工具（含 ingest MCP tool）
```

### 前端

```
app/
├── page.tsx                 # 移动端主页（Level -1 + timeline）
├── write/page.tsx           # PC 写作面板
├── timeline/page.tsx        # PC 时间线三栏
├── map/page.tsx             # PC 认知地图
└── goals/page.tsx           # PC 目标看板

components/
├── brand/lulu-logo.tsx      # 路路 Logo
└── layout/
    ├── menu-bar.tsx          # PC 菜单栏
    └── overlay.tsx           # 通用浮层

features/
├── action-panel/            # 行动面板（移动端执行面）
├── actions/                 # 行动队列（PC 侧边栏）
├── chat/                    # 参谋对话
├── cognitive/               # 认知地图 + Cluster + 决策
├── notes/                   # Strike 展示 + source-type 标签
├── recording/               # 录音 + 统一输入框
├── review/                  # 每日回顾
├── search/                  # 全局搜索
└── writing/                 # 命令面板 + 结构面板 + 选中工具栏
```

### 设计文档

```
docs/
├── PLAN-cognitive-engine.md  # 认知引擎架构（Strike 模型）
├── PLAN-frontend-vision.md   # 移动端双面架构
├── PLAN-pc-design.md         # PC 端四场景设计
├── PLAN-multimodal-input.md  # 多模态输入方案
├── OPERATION-GUIDE.md        # 本文件
├── brand-identity.html       # 品牌识别手册
├── genes.md                  # 基因库（版本记录）
└── gene/
    └── cognitive-engine.md   # 认知引擎 gene 文档
```
