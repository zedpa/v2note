# 移动端行动面板完善

> 状态：✅ completed | 优先级：Phase 7 | 预计：3-4 天
> 增强：2026-03-27 滑动露出标签 + Now Card 嵌入待办视图

## 概述
当前 `features/action-panel/` 已有基础组件（now-card, today-line, goal-indicator），但移动端手势交互（Tinder 滑动、上滑呼出、长按分叉）需要完善。

**当前状态：** action-panel.tsx 有 drag dismiss，但左滑原因选择、反复跳过触发反思等未实现。

## 场景

### 场景 1: Now Card 右滑完成
```
假设 (Given)  行动 A 显示在 Now Card
当   (When)   用户开始右滑
那么 (Then)   卡片右侧逐渐露出森林色(#5C7A5E)背景区域
并且 (And)    露出区域显示「✓ 完成」标签 + 森林色圆形勾选图标
并且 (And)    滑动距离 >40px 时标签从半透明变为全不透明（激活态）
当   (When)   用户右滑超过阈值(80px)并松手
那么 (Then)   行动 A 标记完成，POST /action-panel/event {type:"complete"}
并且 (And)    完成动画：卡片向右飞出 + 森林色消散粒子效果，300ms ease-out
并且 (And)    下一行动从下方上升到 Now Card（spring animation）
当   (When)   用户右滑未超过阈值并松手
那么 (Then)   卡片弹回原位，200ms ease-out
```

### 场景 2: Now Card 左滑"稍后"
```
假设 (Given)  行动 A 显示在 Now Card
当   (When)   用户开始左滑
那么 (Then)   卡片左侧逐渐露出晨光色(#E8A87C)背景区域
并且 (And)    露出区域显示「跳过 →」标签
并且 (And)    滑动距离 >40px 时标签从半透明变为全不透明（激活态）
当   (When)   用户左滑超过阈值(80px)并松手
那么 (Then)   卡片向左飞出 + skip_count += 1
并且 (And)    弹出底部 Action Sheet 选择跳过原因：
              ⏳ 等条件 | 🚧 有阻力 | 🔄 要重想 | [取消]
并且 (And)    用户选择原因 → POST /action-panel/event {type:"skip", reason}
并且 (And)    用户点击取消 → 行动仍然跳过（已飞出），reason 记录为 "later"
并且 (And)    下一行动上升到 Now Card
当   (When)   用户左滑未超过阈值并松手
那么 (Then)   卡片弹回原位，200ms ease-out

注意：改为单步滑动+弹Sheet，避免原"滑到位再精确点击小标签"的两步认知负担
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
| `features/action-panel/components/now-card.tsx` | 修改：滑动露出标签（森林色完成/晨光色跳过） |
| `features/action-panel/components/now-card.test.tsx` | 新增：8 个测试用例 |
| `features/action-panel/components/todo-nowcard-integration.test.tsx` | 新增：4 个集成测试 |
| `features/action-panel/components/action-panel.tsx` | 现有：独立弹窗（保留） |
| `features/action-panel/components/goal-indicator.tsx` | 现有：滑动切换 |
| `features/workspace/components/todo-workspace-view.tsx` | 修改：嵌入 NowCard + GoalIndicator |

## 验收标准
移动端行动面板支持完整的 Tinder 式滑动操作。
