# 行动面板（Action Panel）

> 状态：🟡 待开发

## 概述
从 intend 类型的 Strike 中计算行动优先级（紧急度 × 重要性 × 可执行性），生成当日行动队列。支持"完成"、"稍后"、"今天不做"三种操作，跟踪跳过行为并在适当时机触发反思对话。

## 场景

### 场景 1: 行动优先级排序
```
假设 (Given)  存在 3 个 intend Strike:
              A: "今天必须完成报价单"（紧急+今天）
              B: "本周和张总约饭"（中等+本周）
              C: "Q2前完成供应商评估"（重要+远期）
当   (When)   行动面板计算排序
那么 (Then)   A 应排在最前（Now Card 位置）
并且 (And)    排序依据 = urgency × importance × executability
```

### 场景 2: 标记完成
```
假设 (Given)  行动 A 显示在 Now Card
当   (When)   用户点击完成（✓）
那么 (Then)   对应 intend Strike 标记为已完成
并且 (And)    从行动队列中移除
并且 (And)    下一个行动上升到 Now Card
```

### 场景 3: 稍后处理（右滑）
```
假设 (Given)  行动 A 显示在 Now Card
当   (When)   用户右滑（稍后）
那么 (Then)   行动 A 回到队列末尾
并且 (And)    skip_count += 1
并且 (And)    下一个行动上升到 Now Card
```

### 场景 4: 今天不做（长按下拉）
```
假设 (Given)  行动 A 显示在 Now Card
当   (When)   用户长按下拉选择 "今天不做"
那么 (Then)   系统应弹出原因选择: ⏳等待中-新的日期 / 🚧卡住了-需要重新想想
并且 (And)    行动 A 从今日列表移除
并且 (And)    记录原因标签
```

### 场景 5: 反复跳过触发反思
```
假设 (Given)  行动 A 已被跳过 5 次以上
当   (When)   行动 A 再次出现在队列中
那么 (Then)   系统应显示提示 "$事件，已经在这里$时间段了，要聊聊吗？"
并且 (And)    提供进入对话的入口
并且 (And)    对话中引用该 intend Strike 的上下文
```

### 场景 6: Today Line 显示
```
假设 (Given)  行动面板已计算排序
当   (When)   用户查看行动面板
那么 (Then)   Now Card 显示第 1 项（蓝色高亮）
并且 (And)    Today Line 显示后续 4-5 项
并且 (And)    每项显示: 名称 + 简要上下文 + 紧急度标记（●/○/◇）
```

### 场景 7: 目标呼吸指示器
```
假设 (Given)  用户有 3 个活跃目标
当   (When)   行动面板渲染
那么 (Then)   底部显示 3 个呼吸点（每个代表一个目标）
并且 (And)    点击呼吸点可切换查看该目标相关的行动或者左右滑动面板可以实现目标切换
```

### 场景 8: 无待办行动
```
假设 (Given)  用户没有 intend 类型的活跃 Strike
当   (When)   行动面板加载
那么 (Then)   显示空状态（温暖提示，非冰冷空白）
并且 (And)    不显示 Now Card 和 Today Line
```

## 边界条件
- [x] 无待办（场景 8）
- [ ] 大量行动（>50）：Today Line 只显示 top 5，其余可滚动
- [ ] 行动时间已过（过期）：应标记但不自动删除，用户决定
- [ ] 目标被归档后关联行动：应从队列移除或标记孤立

## 接口约定

输入：
```typescript
interface ActionPanelInput {
  user_id: string
  date?: string             // 默认今天 YYYY-MM-DD
}
```

输出：
```typescript
interface ActionPanelResult {
  nowCard: ActionItem | null
  todayLine: ActionItem[]
  goals: GoalIndicator[]
  stats: {
    totalActions: number
    completedToday: number
    skippedToday: number
  }
}

interface ActionItem {
  strikeId: string
  title: string              // 来自 intend Strike 的 nucleus
  context?: string           // 相关人/上次互动等
  urgency: 'high' | 'medium' | 'low'  // ● / ○ / ◇
  skipCount: number
  needsReflection: boolean   // skipCount >= 5
  dueDate?: string
  goalId?: string            // 关联的目标
}

interface GoalIndicator {
  goalId: string
  name: string
  actionCount: number        // 该目标下的待办数
  health: number             // 0-1 健康度
}
```

## 依赖
- strike 表（polarity = 'intend'，status = 'active'）
- 目标涌现模块（goal emergence）
- 前端行动面板组件

## 备注
- 排序公式: urgency × importance × executability（各维度 0-1）
- urgency 由时间距离计算，importance 由 salience 和 Bond 密度推导
- executability 考虑依赖是否满足（depends_on Bond 的目标 Strike 是否完成）
- 跳过行为的学习是 Phase 2+ 功能（预测用户不做的原因模式）
