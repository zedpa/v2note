# 每日报告合并：智能日报

> 状态：🟡 待开发

## 问题诊断

### 当前架构的 3 个问题

1. **内容重叠严重**：晨间简报（今日重点 + 目标进展）和每日回顾（今日行动 + 目标进展）对新用户来说看起来几乎一样 — 都是"你有这些目标，这些待办"
2. **入口混乱**：侧边栏同时有"每日回顾"和"今日简报"两个按钮，用户不知道该点哪个
3. **Hook 效果弱**：晨间简报仅 7-10am 自动弹一次，错过了就没了；晚间从不自动触发。对"吸引用户回来"几乎没有拉力

### 核心认知

用户不关心"这是晨间还是晚间报告"，用户关心的是：
> **"我现在打开 app，能看到什么对我有价值的东西？"**

## 设计方案：时间感知的智能日报

### 一句话
合并晨间简报和晚间总结为一个**时间感知的智能日报**，用户任何时候打开 app 都看到**当前最相关**的内容。

### 时段策略

| 时段 | 时间 | 核心情绪 | 内容策略 | 语气 |
|------|------|----------|----------|------|
| 晨启 | 6-11 | "今天做什么" | 待办优先 + 昨日遗留 + 目标行动项 | 轻快、行动导向 |
| 午间 | 11-14 | "进行得怎样" | 上午完成 + 下午预览 + 进度条 | 鼓励、中场检查 |
| 午后 | 14-18 | "还剩什么" | 未完成待办 + 目标缺口 + 建议优先级 | 务实、聚焦 |
| 晚间 | 18-22 | "今天值了吗" | 完成回顾 + 认知收获 + 明日预告 | 温暖、肯定 |
| 深夜 | 22-6 | "安心入睡" | 一句话总结 + 明日第一件事 | 简短、安抚 |

### 信息架构（单一组件）

```
SmartDailyReport
├── Header: "日报 · 4月2日 周四"  (不分晨间/晚间)
├── Greeting: 一句话时段问候 (AI 个性化)
├── Section 1: 当前最相关的行动区
│   ├── 晨启: "今日计划" → 排期待办 + 遗留
│   ├── 午间: "上午战报" → 已完成 + 下午待做
│   ├── 午后: "收尾清单" → 未完成 + 建议重排
│   └── 晚间: "今日成就" → 完成列表 + ✓ 动效
├── Section 2: 目标脉搏 (所有时段共用)
│   └── 活跃目标卡片：名称 + 迷你进度条 + 今日贡献
├── Section 3: 路路发现 (有内容才显示)
│   └── 认知亮点 / AI 建议 / 关注提醒
└── Footer CTA:
    ├── 晨启: "开始今天" → 关闭
    ├── 晚间: "和路路聊聊" → 打开 Chat
    └── 其他: "继续" → 关闭
```

### 用户 Hook 策略

**目标**：让用户每天至少打开 2 次 app

| Hook | 机制 | 时机 |
|------|------|------|
| **晨间推送** | 本地通知："小明，今天有 3 件事等你" | 用户设置的回顾时间 (onboarding Q5) |
| **午间闪报** | 通知栏极简："上午完成 2/5 ✓ 继续加油" | 12:00 (仅有待办时) |
| **晚间温暖** | 通知："今天完成了 4 件事，来看看路路的发现" | 21:00 |
| **首次打开自动弹** | App 恢复前台时，如果距上次查看 >4h，自动展示 | 每次前台恢复 |
| **红点徽标** | 侧边栏"日报"按钮带数字 badge = 未读发现数 | 有新内容时 |

### 与当前架构的对应

| 当前 | 合并后 |
|------|--------|
| MorningBriefing 组件 | SmartDailyReport (晨启模式) |
| EveningSummary 组件 | SmartDailyReport (晚间模式) |
| 侧边栏"今日简报" + "每日回顾" | 合并为一个"日报"按钮 |
| auto-trigger 仅 7-10am | 每次前台恢复 + 距上次 >4h |
| 2 个 API endpoint | 合并为 1 个 `/api/v1/daily/report?period=auto` |

## 场景

### 场景 1: 早上打开 app
```
假设 (Given)  用户在 8:30 打开 app，有 5 个今日待办（2 个遗留）
当   (When)   app 加载完成
那么 (Then)   自动弹出日报，晨启模式
并且 (And)    显示"早上好，小明" + 今日计划列表 + 遗留提醒
并且 (And)    底部 CTA "开始今天"
```

### 场景 2: 下午重新打开 app（距上次 >4h）
```
假设 (Given)  用户 14:00 打开 app，上午完成了 3 个待办
当   (When)   距上次查看日报 >4h
那么 (Then)   自动弹出日报，午后模式
并且 (And)    显示"下午好" + 上午完成 3 件 ✓ + 还剩 2 件未完成
并且 (And)    底部 CTA "继续"
```

### 场景 3: 晚上手动查看
```
假设 (Given)  用户 21:00 点击侧边栏"日报"
当   (When)   日报加载
那么 (Then)   晚间模式
并且 (And)    显示"今日成就" + 认知发现 + 明日预告
并且 (And)    底部 CTA "和路路聊聊"
```

### 场景 4: 新用户无数据
```
假设 (Given)  注册当天，仅有种子目标，无待办
当   (When)   日报弹出
那么 (Then)   显示简短欢迎 + 种子目标列表 + "试试录一条想法"引导
并且 (And)    不显示空的完成/统计区域
```

### 场景 5: 深夜打开
```
假设 (Given)  用户 23:30 打开 app
当   (When)   日报弹出
那么 (Then)   极简模式：一句话总结 + 明日第一件事
并且 (And)    语气温暖："今天辛苦了，明天第一件事是…"
并且 (And)    不显示目标进度等复杂卡片
```

## 边界条件
- [ ] 跨日（23:59 → 00:01）时日报内容切换
- [ ] 无待办、无目标的极端空状态
- [ ] 快速连续打开/关闭 → 不重复 API 请求（加缓存 TTL）
- [ ] 离线状态 → 显示上次缓存的日报 + "离线模式"标记
- [ ] 用户手动刷新 → 强制重新生成

## 接口约定

### 合并后 API
```typescript
// GET /api/v1/daily/report?period=auto&refresh=false
// period: "morning" | "midday" | "afternoon" | "evening" | "night" | "auto"
// auto = 服务端根据请求时间自动选择

interface DailyReport {
  period: "morning" | "midday" | "afternoon" | "evening" | "night";
  greeting: string;
  
  // 行动区 — 根据时段填充不同内容
  action: {
    title: string;  // "今日计划" | "上午战报" | "收尾清单" | "今日成就"
    completed: Array<{ text: string; goal_title?: string }>;
    pending: Array<{ text: string; priority: number; time_slot?: string }>;
    carry_over: string[];
  };
  
  // 目标脉搏 — 所有时段
  goals: Array<{
    title: string;
    total: number;
    done_today: number;
    remaining: number;
    note: string;  // AI 一句话
  }>;
  
  // 路路发现 — 有就显示，无就隐藏
  discoveries: string[];
  
  // 明日预告 — 午后/晚间才有
  tomorrow?: {
    first_thing: string;  // 明日第一件事
    scheduled: string[];
  };
  
  // 统计 — 简化
  stats: {
    done_today: number;
    total_today: number;
    streak: number;
  };
  
  // CTA
  cta: {
    text: string;  // "开始今天" | "继续" | "和路路聊聊"
    action: "close" | "chat";
  };
}
```

## 实施阶段

### Phase 1: 前端合并（先做，快速见效）
1. 新建 `SmartDailyReport` 组件，内部根据时段渲染不同布局
2. 侧边栏合并为一个"日报"按钮
3. 暂时前端判断时段，分别调用现有的 briefing/evening-summary API
4. 统一 auto-trigger 逻辑

### Phase 2: 后端合并
1. 新建 `/api/v1/daily/report` 统一端点
2. 合并 `generateMorningBriefing` 和 `generateEveningSummary` 逻辑
3. 添加午间/午后/深夜时段生成
4. 优化缓存策略：同一时段 TTL 2h

### Phase 3: Hook 增强
1. 前台恢复自动弹出（Capacitor App.addListener）
2. 本地推送通知
3. 红点 badge

## 依赖
- features/daily/ — 现有组件和 hooks
- gateway/src/handlers/daily-loop.ts — 现有生成逻辑
- app/page.tsx — overlay 管理
- Capacitor App plugin（Phase 3 推送）

## 备注
- 保留现有 API 端点向后兼容，新端点并行上线
- AI prompt 需要根据时段切换语气和内容重点
- "路路发现"是杀手锏 — 用户来看日报是例行公事，但发现新的认知联结会产生惊喜感
