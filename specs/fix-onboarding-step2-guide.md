---
id: fix-onboarding-step2-guide
title: "Fix: 冷启动第二步改为聚焦操作引导"
status: completed
backport: cold-start.md
domain: onboarding
risk: low
dependencies: []
created: 2026-04-12
updated: 2026-04-12
---

# Fix: 冷启动第二步改为聚焦操作引导

## 问题

冷启动 Step 2 当前设计：用户输入一句话 → 同步调用 `processEntry()`（完整 AI pipeline）→ 等待 5-15 秒 → 展示 AI 拆解结果。

用户在"AI 正在整理..."上长时间卡住，第一印象极差。

## 方案

删除 Step 2 的文本输入和 AI 调用。用户输完名字后直接进入主界面，然后触发**聚焦操作引导（Coach Mark）**：

- 半透明遮罩覆盖全屏
- 高亮目标区域（镂空 spotlight）
- 旁边显示引导文案 + 操作按钮
- 引导用户实际点击/操作真实 UI

### 引导步骤

| 步骤 | 高亮目标 | 引导文案 | 操作 |
|------|----------|----------|------|
| 1 | FAB 录音按钮 | "按住说话，松开自动记录" | 用户点击任意位置进入下一步 |
| 2 | 待办 Tab | "对路路说'帮我建个待办'\n试试语音指令" | 用户点击任意位置完成引导 |

## 场景

### S1: 引导触发

```
假设 (Given)  新用户完成 Step 1（输入名字）
当   (When)   onComplete 被调用，进入主界面
那么 (Then)   主界面加载完成后，自动触发聚焦引导第一步
并且 (And)    半透明黑色遮罩覆盖全屏（除高亮区域外）
并且 (And)    FAB 按钮区域被 spotlight 高亮
并且 (And)    旁边显示引导气泡文案
```

### S2: 引导步进

```
假设 (Given)  用户在引导第 1 步
当   (When)   用户点击屏幕任意位置（或点击"下一步"）
那么 (Then)   进入引导第 2 步
并且 (And)    spotlight 移动到"待办" Tab 区域
并且 (And)    引导文案更新
```

### S3: 引导完成

```
假设 (Given)  用户在引导最后一步
当   (When)   用户点击屏幕任意位置（或点击"知道了"）
那么 (Then)   遮罩消失，引导完成
并且 (And)    localStorage 标记 v2note:guide-done:{userId} = "true"
并且 (And)    不再触发引导
```

### S4: 跳过引导（在 onboarding-seed 阶段）

```
假设 (Given)  用户在 Step 1 名字页面
当   (When)   点击"跳过，直接开始"
那么 (Then)   进入主界面，同样触发聚焦引导
```

### S5: 引导不重复

```
假设 (Given)  用户已完成引导（localStorage 有标记）
当   (When)   再次打开应用
那么 (Then)   不触发引导
```

## 验收行为（E2E 锚点）

### 行为 1: 进入主界面
新用户输入名字后，进入主界面

### 行为 2: FAB 高亮
主界面出现半透明遮罩，FAB 按钮被高亮

### 行为 3: 引导文案
显示引导文案"按住说话，松开自动记录"

### 行为 4: 切换到待办 Tab
点击任意位置后 spotlight 切换到待办 Tab，文案变为指令引导

### 行为 5: 引导完成
再点击遮罩消失，引导完成

### 行为 6: 不重复触发
刷新页面后不再触发引导

## 改动范围

| 文件 | 改动 |
|------|------|
| `features/cognitive/components/onboarding-seed.tsx` | 删除 Step 2（整个 textarea/AI 调用/结果展示），Step 1 完成后直接 onComplete |
| `components/coach-mark.tsx` | **新建**：通用聚焦引导组件（遮罩 + spotlight + 文案气泡） |
| `app/page.tsx` | onboarding 完成后触发 coach mark 引导流程 |
| `gateway/src/handlers/onboarding.ts` | Step 2 简化：只标记 onboarding_done，不调用 processEntry |

## 组件设计

### CoachMark 组件

```typescript
interface CoachMarkStep {
  /** 目标元素的 CSS 选择器或 ref */
  target: string;
  /** 引导文案（支持 \n 换行） */
  message: string;
  /** 气泡位置 */
  placement: "top" | "bottom" | "left" | "right";
}

interface CoachMarkProps {
  steps: CoachMarkStep[];
  onComplete: () => void;
  /** 点击遮罩区域也前进到下一步 */
  advanceOnOverlayClick?: boolean;
}
```

### 使用方式（app/page.tsx）

```tsx
const ONBOARDING_GUIDE_STEPS: CoachMarkStep[] = [
  {
    target: "[data-guide='fab']",
    message: "按住说话，松开自动记录",
    placement: "top",
  },
  {
    target: "[data-guide='tab-todo']",
    message: "对路路说"帮我建个待办"\n试试语音指令",
    placement: "bottom",
  },
];
```

FAB 和 Tab 组件加上 `data-guide` 属性作为锚点。

## 边界条件

- [ ] 目标元素还未渲染（异步加载）→ 延迟 500ms 重试，3 次后跳过该步骤
- [ ] 屏幕旋转/resize → spotlight 位置重新计算
- [ ] 引导过程中用户按返回键 → 取消引导，标记完成
