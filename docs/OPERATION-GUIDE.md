# v2note 认知引擎 — 操作说明

## 环境准备

### 数据库

认知层表需要 migration 017：

```bash
cd gateway
node scripts/run-migration.mjs ../supabase/migrations/017_cognitive_layer.sql
```

验证表是否创建：

```bash
node scripts/verify-tables.mjs
# 应输出：认知层表: bond, cluster_member, strike, strike_tag
```

### 启动服务

```bash
# 终端 1: Gateway
cd gateway
npx tsx src/index.ts
# 应看到：
# [gateway] v2note Dialog Gateway running on port 3001
# [proactive] Cognitive digest fallback timer started (interval: 3h)
# [proactive] Cognitive daily cycle fallback timer started (interval: 24h)
# [proactive] Weekly emergence fallback timer started (interval: 7d)

# 终端 2: 前端
npx next dev
# 应看到：
# ✓ Ready in xxxms
# http://localhost:3000
```

### Seed 测试数据（可选）

如果数据库中还没有 Strike 数据：

```bash
cd gateway

# 创建基础 Strike（7 个，模拟一次供应链会议的记录）
node scripts/seed-test-strikes.mjs

# 创建 Cluster（将 Strike 聚合为"供应链管理"主题）
node scripts/seed-cluster.mjs

# 补充丰富数据（添加对立观点、认知模式、目标）
node scripts/seed-cluster-rich.mjs
```

如果 seed 数据关联到了错误的用户（登录用户和 Strike 用户不同）：

```bash
node scripts/fix-cluster-user.mjs
```

---

## 前端交互指南

### 默认态：Level -1 纯净入口

打开 APP 后看到大时间和录音按钮。这是"倾倒模式"——说完就走，不看任何地图。

- **录音**：点底部橙色按钮
- **切换到时间线**：点右上角网格图标
- **进入认知地图**：点右上角大脑图标 🧠

### 行动面板：上滑呼出

从屏幕底部**上滑**，呼出行动面板。

- **此刻卡片**：系统推荐的下一件事
  - **右滑** → 标记完成（绿色闪现）
  - **左滑到一半停住** → 分叉选择：
    - 继续左滑出去 = "稍后再说"
    - 手指下拉 = "今天不做"，可选标签：⏳等条件 / 🚧有阻力 / 🔄要重想
- **今日线**：按优先级排列的行动序列（●下一个 ○计划中 ◇灵活）
- **目标指示器**：底部圆点，点击切换不同目标的行动
- **长按卡片**：穿越到认知地图，查看该行动的认知链全貌

### 认知地图：Level 0-2

点 🧠 大脑图标进入。

**Level 0 — 人生全景**
- 看到所有 Cluster 卡片，每个代表一个认知主题
- 卡片上只有纯数据：条数、最近记录时间、是否有对立观点
- **长按卡片** → 进入连接模式 → 点另一个卡片 → 手动建立关联

**Level 2 — Cluster 展开**（点击卡片进入）

四个区域，有数据时才显示：

| 区域 | 颜色 | 内容 |
|------|------|------|
| 认知模式 | 紫色 | AI 发现的思维模式 + "这准确吗？[是][否]" |
| 对立观点 | 琥珀色 | 矛盾的 Strike 对 + "帮我想想这个问题" |
| 目标状态 | 白色 | 目标 + 四要素光谱（方向/资源/路径/驱动） |
| 认知时间线 | — | 所有成员 Strike，按日期排列，带极性图标 |

极性图标：👁蓝=感知 ⚖️橙=判断 💡紫=领悟 🎯绿=意图 ❤️红=感受

### 决策工作台

从 Cluster 展开的"帮我想想这个问题"进入。

AI 基于你的认知图谱分析决策，输出结构化的：
- 支持论据（绿色边框）
- 反对论据（红色边框）
- 信息缺口（橙色边框）
- 你的思维模式（紫色边框）

每条可溯源到原始记录。底部可继续和 AI 对话。

### 冷启动

首次使用时（localStorage 无 `v2note:onboarded`）显示播种对话：
- 三个引导问题
- 录音或打字回答
- 回答转化为初始 Strike
- 跳过也可以

---

## 后台自动运行

| 定时任务 | 频率 | 作用 |
|---------|------|------|
| Digest 批量 | 每 3 小时 | 消化未处理的录音记录为 Strike |
| Daily Cognitive Cycle | 每天凌晨 3 点 | 聚类 → 矛盾扫描 → 融合 → 维护 |
| Weekly Emergence | 每周日凌晨 4 点 | 跨 Cluster 关联 → 认知模式提炼 |

### 手动触发

目前没有手动触发按钮。可通过脚本模拟：

```bash
# 触发一次完整的 daily cycle（需要 gateway 运行中）
# 暂未提供独立触发脚本，需要直接调用内部模块
```

---

## API 参考

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/action-panel` | GET | 行动面板数据（此刻卡片+今日线+目标） |
| `/api/v1/action-panel/swipe` | POST | 记录滑动行为 |
| `/api/v1/cognitive/stats` | GET | 认知统计（极性分布、cluster 数量等） |
| `/api/v1/cognitive/clusters` | GET | 顶层 Cluster 列表 |
| `/api/v1/cognitive/clusters/:id` | GET | Cluster 详情（成员+矛盾+模式） |
| `/api/v1/cognitive/bonds` | POST | 手动创建 Bond |
| `/api/v1/records/:id/strikes` | GET | 某条记录的 Strike 列表 |
| `/api/v1/strikes/:id` | PATCH | 修改 Strike（nucleus/polarity） |
| `/api/v1/strikes/:id/trace` | GET | Strike 溯源链 |
| `/api/v1/chat/decision` | POST | 决策分析（AI 基于认知图谱） |

---

## E2E 测试

```bash
# 需要 gateway + next dev 同时运行

# P2 认知地图验证
node scripts/e2e-p2.mjs

# P3 Cluster 展开验证
node scripts/e2e-p3.mjs

# P4 决策工作台验证
node scripts/e2e-p4.mjs

# P5 冷启动验证
node scripts/e2e-p5.mjs

# 截图保存在 scripts/screenshots/
```

---

## 关键文件索引

### 认知引擎（后端）

```
gateway/src/cognitive/
├── action-panel.ts      # 行动面板计算
├── alerts.ts            # 矛盾冲突推送
├── clustering.ts        # Level 2 聚类引擎
├── clustering-prompt.ts # 聚类 AI prompt
├── contradiction.ts     # 矛盾扫描
├── daily-cycle.ts       # 每日认知周期编排
├── decision.ts          # 决策分析
├── emergence.ts         # Level 3 涌现引擎
├── maintenance.ts       # 归一化 + 衰减
├── promote.ts           # 融合 Promote
├── retrieval.ts         # 混合检索（语义+结构化+cluster）
└── swipe-tracker.ts     # 滑动行为追踪
```

### 前端

```
features/
├── action-panel/        # 行动面板（执行面）
│   ├── components/
│   │   ├── action-panel.tsx    # 底部抽屉容器
│   │   ├── now-card.tsx        # Tinder 式此刻卡片
│   │   ├── today-line.tsx      # 今日行动线
│   │   └── goal-indicator.tsx  # 目标圆点
│   └── hooks/
│       └── use-action-panel.ts
├── cognitive/           # 认知地图（思考面）
│   ├── components/
│   │   ├── life-map.tsx        # Level 0 人生全景
│   │   ├── cluster-detail.tsx  # Level 2 Cluster 展开
│   │   ├── decision-workspace.tsx # 决策工作台
│   │   ├── link-hint.tsx       # 关联提示
│   │   └── onboarding-seed.tsx # 冷启动播种
│   └── hooks/
│       └── use-cognitive-map.ts
└── notes/
    ├── components/
    │   └── strike-preview.tsx  # Strike 展示+编辑
    └── hooks/
        └── use-strikes.ts
```

### 设计文档

- `docs/PLAN-cognitive-engine.md` — 认知引擎架构设计（Strike 模型+Digest+涌现）
- `docs/PLAN-frontend-vision.md` — 前端双面架构设计（行动面板+认知地图+穿越交互）
- `docs/gene/cognitive-engine.md` — 认知引擎 Gene 文档
