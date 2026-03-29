# 每日回顾重构

> 状态：✅ 已完成
> 优先级：P1 — 现有 mock 壳影响体验

## 概述
将硬编码 mock 的 `daily-review.tsx` 替换为真实数据驱动的每日回顾。晨间简报和晚间总结后端已完整实现，但前端入口混乱（三个组件功能重叠），需统一为卡片横滑式设计。

## 现状问题
1. `features/review/components/daily-review.tsx` — 硬编码 mock 数据的旧壳
2. `features/daily/components/morning-briefing.tsx`（229 行）— 真实 API，纵向滚动
3. `features/daily/components/evening-summary.tsx`（215 行）— 真实 API，纵向滚动
4. 设计稿 14 要求卡片横滑式，当前为纵向滚动列表
5. 侧边栏"每日回顾"可能跳转到 mock 壳

## 场景

### 场景 1: 晨间简报自动弹出
```
假设 (Given)  当前时间 7:00-10:00，用户今日首次打开 App
当   (When)   主页加载完成
那么 (Then)   自动弹出 morning-briefing overlay
并且 (And)    调用 GET /api/v1/daily/briefing
并且 (And)    以卡片横滑方式展示：问候语 → 今日待办 → 洞察 → 目标进展
```

### 场景 2: 卡片横滑导航
```
假设 (Given)  晨间简报或晚间总结已打开
当   (When)   用户左右滑动
那么 (Then)   切换到上一张/下一张卡片
并且 (And)    底部显示分页指示器（圆点）
并且 (And)    最后一张卡片显示"开始今天"/"今日完成"按钮
```

### 场景 3: 晚间总结手动打开
```
假设 (Given)  用户想回顾今天
当   (When)   用户点击侧边栏"每日回顾" 或 收到晚间通知
那么 (Then)   打开 evening-summary overlay
并且 (And)    调用 GET /api/v1/daily/evening-summary
并且 (And)    卡片包含：今日成就 → 认知亮点 → 目标更新 → 需关注项 → 明日预览
```

### 场景 4: 中继待办处理
```
假设 (Given)  晨间简报中显示中继待办（重要未完成）
当   (When)   用户点击中继待办
那么 (Then)   展开该待办详情
并且 (And)    提供"今天继续"/"推迟"/"放弃"操作
并且 (And)    选择后调用 PATCH /api/v1/daily/relays/:id
```

### 场景 5: 删除 mock 壳
```
假设 (Given)  重构完成
当   (When)   代码清理
那么 (Then)   删除 features/review/components/daily-review.tsx
并且 (And)    侧边栏"每日回顾"入口改为打开 morning-briefing 或 evening-summary（按时段判断）
并且 (And)    ReviewOverlay 中不再引用 daily-review
```

### 场景 6: 无数据状态
```
假设 (Given)  用户今天没有记录任何内容
当   (When)   打开晚间总结
那么 (Then)   显示友好提示："今天比较安静，休息也是一种前进"
并且 (And)    不显示空卡片
```

## 边界条件
- [ ] 晨间简报在已弹出后不重复弹出（localStorage 记录当日弹出状态）
- [ ] 滑动到边界时的弹性回弹
- [ ] 数据加载中显示骨架屏（卡片占位）
- [ ] 网络失败时显示缓存的上次数据

## 接口约定

已有接口，无需新建：
```typescript
// GET /api/v1/daily/briefing
interface MorningBriefing {
  greeting: string;
  topTodos: Todo[];
  insights: string[];
  activeGoals: Goal[];
}

// GET /api/v1/daily/evening-summary
interface EveningSummary {
  accomplishments: string[];
  cognitive_highlights: string[];
  goal_updates: GoalUpdate[];
  attention_needed: string[];
  relay_summary: Todo[];
  stats: { records: number; todos_completed: number };
  tomorrow_preview: string;
}

// GET /api/v1/daily/relays
// PATCH /api/v1/daily/relays/:id
```

## 依赖
- `GET /api/v1/daily/briefing` — ✅ 已实现
- `GET /api/v1/daily/evening-summary` — ✅ 已实现
- `GET /api/v1/daily/relays` — ✅ 已实现（前端未接）
- `PATCH /api/v1/daily/relays/:id` — ✅ 已实现
- `features/daily/hooks/use-daily-briefing.ts` — ✅ 已有 hook

## 关键文件
- `features/daily/components/morning-briefing.tsx` — 保留并重构为卡片横滑
- `features/daily/components/evening-summary.tsx` — 保留并重构为卡片横滑
- `features/review/components/daily-review.tsx` — 删除（mock 壳）
- `features/reviews/components/review-overlay.tsx` — 清理对 daily-review 的引用
- `features/sidebar/components/sidebar-drawer.tsx` — 回顾入口改为按时段跳转

## 备注
- 设计稿参考：`docs/designs/14-daily-review.png`
- 卡片横滑可用 framer-motion 的 `drag="x"` + `AnimatePresence`
- 晨间/晚间是两个独立 overlay，不是一个入口的两个 tab
