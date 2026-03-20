# ACTIVE_TASKS.md — 前端 P0: 行动面板

> 设计文档：docs/PLAN-frontend-vision.md
> P0 目标：行动面板上线——上滑呼出、此刻卡片、今日线、目标指示器、左右滑

---

## TASK-FE-01: 后端 action-panel API

**复杂度**: L
**涉及文件**:
- `gateway/src/cognitive/action-panel.ts`（新建）
- `gateway/src/routes/action-panel.ts`（新建）
- `gateway/src/index.ts`（注册路由）

**具体任务**:
1. 实现 computeActionPanel(userId)：
   - 找活跃目标（Intend 类 Strike，salience 最高的 5 个）
   - 每个目标沿 Bond 找待执行 Action（未完成的 Intend/Task Strike）
   - 按 紧迫度×重要度 排序
   - 取 top-1 为此刻卡片，2-5 为今日线
   - 用 AI 语义粗分三档时长（快速/中等/深度）
2. REST API：GET /api/v1/action-panel
3. 缓存：计算结果存内存或 Redis，每次 Digest 完成后刷新

**验收标准**:
- [ ] API 返回 {now, today[], goals[]}
- [ ] 无 Strike 数据时返回空面板不报错

---

## TASK-FE-02: 行动面板前端组件

**复杂度**: L
**涉及文件**:
- `features/action-panel/components/action-panel.tsx`（新建）
- `features/action-panel/components/now-card.tsx`（新建）
- `features/action-panel/components/today-line.tsx`（新建）
- `features/action-panel/components/goal-indicator.tsx`（新建）
- `features/action-panel/hooks/use-action-panel.ts`（新建）
- `shared/lib/api/action-panel.ts`（新建）

**具体任务**:
1. ActionPanel 容器：
   - 从底部上滑呼出，占屏幕下半部分
   - 毛玻璃半透明背景（backdrop-blur）
   - 拖拽手柄下拉关闭
2. NowCard 此刻卡片：
   - 目标名 + 一句话行动 + 上下文 + 操作图标
   - 左右滑交互（CSS transform + touch events）
   - 左滑分叉：滑到一半停住，露出"稍后/今天不做"
3. TodayLine 今日线：
   - ●/○/◇ 三种状态符号
   - 最多显示 4-5 项，超出折叠
   - 点击展开上下文
4. GoalIndicator 目标指示器：
   - 底部一排小圆点
   - 点击切换目标，面板内容刷新

**验收标准**:
- [ ] 上滑面板流畅（CSS transform，无卡顿）
- [ ] 左右滑动流畅（60fps）
- [ ] 左滑分叉交互正确（0.3s 停顿 + 双选项）
- [ ] 目标切换正确

---

## TASK-FE-03: 集成到 app/page.tsx

**复杂度**: M
**涉及文件**:
- `app/page.tsx`（改造）

**具体任务**:
1. 在页面底部添加 ActionPanel 的上滑触发区域
2. 手势检测：底部区域上滑 → 呼出面板
3. 面板呼出时，背景内容压暗（overlay）
4. 面板关闭后回到原来的视图

**验收标准**:
- [ ] 从任何页面状态都能上滑呼出
- [ ] 面板和现有 FAB/录音按钮不冲突
- [ ] 手势不误触（需要从底部边缘开始才触发）

---

## TASK-FE-04: 左滑行为追踪

**复杂度**: M
**涉及文件**:
- `gateway/src/cognitive/swipe-tracker.ts`（新建）
- `gateway/src/routes/action-panel.ts`（扩展）

**具体任务**:
1. POST /api/v1/action-panel/swipe：记录滑动行为
   - {strikeId, direction: 'left'|'right', reason?: 'later'|'wait'|'blocked'|'rethink'}
2. 后端存储滑动记录（新表或现有表扩展）
3. 右滑 → 标记 Strike 关联的 todo 为完成
4. 左滑 3 标签 → 创建对应的行为信号 Strike

**验收标准**:
- [ ] 滑动行为正确记录
- [ ] 右滑自动标记完成
- [ ] 左滑标签正确创建行为信号

---

## 执行顺序

```
FE-01（后端 API）→ FE-02（前端组件）→ FE-03（集成）→ FE-04（行为追踪）
```

串行执行，每步依赖前一步。
