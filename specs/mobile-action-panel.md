# 移动端行动面板完善

> 状态：🟡 待开发 | 优先级：Phase 6 | 预计：3-4 天

## 概述
当前 `features/action-panel/` 已有基础组件（now-card, today-line, goal-indicator），但移动端手势交互（Tinder 滑动、上滑呼出、长按分叉）需要完善。

**当前状态：** action-panel.tsx 有 drag dismiss，但左滑原因选择、反复跳过触发反思等未实现。

## 场景

### 场景 1: Now Card 右滑完成
```
假设 (Given)  行动 A 显示在 Now Card
当   (When)   用户右滑超过阈值
那么 (Then)   行动 A 标记完成
并且 (And)    下一行动上升到 Now Card
并且 (And)    完成动画（绿色消散）
```

### 场景 2: Now Card 左滑"稍后"
```
假设 (Given)  行动 A 显示在 Now Card
当   (When)   用户左滑
那么 (Then)   行动 A 回到队列末尾
并且 (And)    skip_count += 1
并且 (And)    下一行动上升
```

### 场景 3: 长按下拉"今天不做"
```
假设 (Given)  行动 A 显示在 Now Card
当   (When)   用户长按下拉
那么 (Then)   弹出原因选择：⏳等待中-新日期 / 🚧卡住了-需要重新想想
并且 (And)    行动 A 从今日列表移除 + 记录原因
```

### 场景 4: 反复跳过触发反思
```
假设 (Given)  行动 A 已被跳过 5+ 次
当   (When)   行动 A 再次出现
那么 (Then)   显示提示："$事件，已经在这里$时间段了，要聊聊吗？"
并且 (And)    提供进入参谋对话的入口
```

### 场景 5: 目标呼吸指示器交互
```
假设 (Given)  用户有 3 个活跃目标
当   (When)   底部呼吸点可见
那么 (Then)   点击切换该目标相关行动
并且 (And)    左右滑动面板也可切换目标
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `features/action-panel/components/now-card.tsx` | 修改：手势交互 |
| `features/action-panel/components/action-panel.tsx` | 修改：长按 + 原因选择 |
| `features/action-panel/components/goal-indicator.tsx` | 修改：滑动切换 |

## 验收标准
移动端行动面板支持完整的 Tinder 式滑动操作。
