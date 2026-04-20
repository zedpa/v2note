---
id: "todo-ui-redesign-scenarios"
status: completed
domain: todo
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# Todo UI 全面重构 — 场景与实施

> Status: ✅ 实现完成 — 数据层+UI组件+集成+E2E 全部就位
> Created: 2026-03-31
> 拆分说明：本文件为原 `todo-ui-redesign.md`（860 行，R7 违规）拆分后的【场景/后端/E2E/实施】部分，设计目标/信息架构/数据规范/UI 组件规范见 `todo-ui-redesign-spec.md`

## 5. 场景规格（Given/When/Then）

### 场景 1: 时间视图 — 默认加载

```
Given 用户在待办 Tab
When  页面加载完成
Then  显示时间视图（默认）
  And 显示今天的星期和日期
  And CalendarStrip 高亮今天，显示本周 7 天
  And 4 个时段块按序显示（随时/上午/下午/晚上）
  And 每个时段块内显示对应时段的未完成任务
  And 无任务的时段块显示空状态占位卡
```

### 场景 2: 时间视图 — 日期切换（无限滚动）

```
Given 时间视图已加载
When  用户点击 CalendarStrip 上的某一天
Then  该日期高亮
  And TimeViewHeader 更新为对应星期和月份
  And 4 个时段块刷新为该日期的任务

When  用户向右滑动 CalendarStrip 超出当前周
Then  自动加载下一周日期（无限向未来滚动）
  And 新一周的日期无缝衔接

When  用户向左滑动 CalendarStrip 超出当前周
Then  自动加载上一周日期（无限向过去滚动）

When  用户点击 TimeViewHeader 右侧的日历图标
Then  CalendarStrip 滚动回今天并选中
```

### 场景 3: 时间视图 — 时段折叠

```
Given 某时段块有 3 个任务
When  用户点击该时段的 BlockHeader
Then  任务列表收起（AnimatePresence 淡出 + 高度收缩）
  And 计数仍然显示
When  再次点击
Then  任务列表展开
```

### 场景 4: 时间视图 — 快速添加任务

```
Given 上午时段块显示空状态
When  用户点击空状态卡片的 + 按钮
Then  打开 TodoCreateSheet
  And 日期预填为当前 selectedDate
  And 时段预设为"上午"（scheduled_start 设为当日 09:00）
When  用户输入"准备会议 PPT"并提交
Then  Sheet 关闭
  And 上午时段块立即显示新任务（乐观更新）
  And 空状态卡片消失
```

### 场景 5: 项目视图 — 加载（水平轮播）

```
Given 用户点击右上角视图切换按钮
When  切换到项目视图
Then  显示第一个活跃项目的 ProjectCard（全宽）
  And 底部显示 PageDots 分页指示器（第一个圆点实心）
  And 圆点总数 = 活跃项目数 + 1（"其他"分组）
  And 卡片内列出该项目的子任务（parent_id = project.id, level = 0）
  And 已完成任务以划线形式显示在未完成之后
```

### 场景 5b: 项目视图 — 左右滑动切换

```
Given 项目视图显示第一个项目
When  用户向左滑动
Then  当前卡片滑出，下一个项目卡片滑入（弹性阻尼）
  And PageDots 更新为第二个圆点实心
When  用户滑到最后一页
Then  显示"其他"分组（InboxCard），列出所有散装任务
  And PageDots 最后一个圆点实心
When  用户继续向左滑动
Then  弹性回弹，不再前进（最后一页）
```

### 场景 6: 项目视图 — 完成任务

```
Given 项目"供应链优化"下有任务"回复客户邮件"
When  用户点击该任务的 checkbox
Then  checkbox 变为勾选状态
  And 任务文字添加删除线 + 透明度降低
  And 项目计数 -1（乐观更新）
  And 后端 PATCH done=true
  And 如果该项目下所有任务已完成，显示恭喜提示
```

### 场景 7: 项目视图 — 添加任务

```
Given 项目"供应链优化"的 ProjectCard
When  用户点击底部"+ 添加任务"
Then  打开 TodoCreateSheet
  And parent_id 预填为该项目 ID
  And 领域预填为该项目的 domain
When  用户输入并提交
Then  新任务出现在该 ProjectCard 的列表底部
```

### 场景 8: 视图切换

```
Given 用户在时间视图
When  点击右上角切换按钮
Then  时间视图淡出 + 向左平移
  And 项目视图淡入 + 从右平移
  And 切换按钮图标变化（表示当前视图类型）
When  再次点击
Then  切换回时间视图（反向动画）
```

### 场景 9: 任务详情编辑

```
Given 时间视图中某任务卡片
When  用户点击任务行（非 checkbox 区域）
Then  底部弹出 TodoEditSheet
  And 显示任务标题（可编辑）
  And 显示当前日期/时间/时长
  And 显示领域 + 影响度
  And 显示关联目标（如有）
  And 显示子任务列表（如有）
  And 显示 AI action plan（如有）
When  用户修改日期为明天并保存
Then  Sheet 关闭
  And 该任务从今天的时段块中消失
  And 乐观更新本地数据
```

### 场景 10: 空状态引导

```
Given 用户无任何待办
When  打开待办 Tab
Then  时间视图 4 个时段块全部显示空状态卡片
  And 每个空状态卡片显示对应时段的引导文案
  And 有明确的 + 添加入口
When  切换到项目视图
Then  显示温暖的空状态引导
  And 提示"录一条语音，路路会帮你整理待办"
  And 或提示"点击 + 创建你的第一个项目"
```

### 场景 11: 实时同步

```
Given 用户正在看待办时间视图
When  后端通过 AI digest 创建了一个新待办
  And WebSocket 推送 todo.created 事件
Then  新待办自动出现在对应时段块中
  And 有轻量入场动画
  And 时段计数 +1
```

### 场景 12: 已完成任务显示（划线保留）

```
Given 某时段有 3 个任务，其中 1 个已完成
When  渲染该时段块
Then  未完成任务正常显示在前
  And 已完成任务显示在后，文字划线 + opacity 50%
  And BlockHeader 计数只统计未完成数
  And 已完成区域可折叠（默认展开）

Given 项目视图中某项目有 5 个任务，其中 2 个已完成
When  渲染该 ProjectCard
Then  未完成任务在前，已完成任务划线在后
  And 项目 header 计数只统计未完成数
```

## 6. 待废弃组件

重构完成后删除以下文件：

| 文件 | 行数 | 替代 |
|------|------|------|
| `features/todos/components/todo-panel.tsx` | 539 | TimeView + ProjectView |
| `features/todos/components/todo-diary-card.tsx` | 255 | TimeView |
| `features/todos/components/today-gantt.tsx` | 298 | TimeView（CalendarStrip + TimeBlock） |
| `features/todos/components/todo-view.tsx` | 128 | TaskItem 在 sidebar 中直接使用 |
| `features/todos/hooks/use-todos.ts` | 60 | useTodoStore |
| `features/todos/hooks/use-today-todos.ts` | 80 | useTodoStore |

保留并重构：
| 文件 | 改动 |
|------|------|
| `features/todos/components/todo-detail-sheet.tsx` | 重构为 TodoEditSheet |
| `features/todos/lib/domain-config.ts` | 保留，增加时段配置 |
| `features/workspace/components/todo-workspace-view.tsx` | 简化为路由容器 |

## 7. 后端改动需求

### 7.1 新增 API：按日期查询待办

```
GET /api/v1/todos?date=2026-03-31

逻辑：
  WHERE (scheduled_start::date = $date OR (scheduled_start IS NULL AND created_at::date = $date))
    AND done = false
  UNION
  WHERE done = true AND completed_at::date = $date
  ORDER BY scheduled_start ASC NULLS FIRST
```

当前 `GET /api/v1/todos` 返回全量，增加 `date` 参数支持按日过滤，减少前端计算。

### 7.2 goal_title JOIN

确保 `findByDevice` / `findByUser` 的 SQL 中 LEFT JOIN parent todo 返回 `goal_title`：

```sql
SELECT t.*,
  parent.text AS goal_title,
  (SELECT count(*) FROM todo sub WHERE sub.parent_id = t.id) AS subtask_count,
  (SELECT count(*) FROM todo sub WHERE sub.parent_id = t.id AND sub.done = true) AS subtask_done_count
FROM todo t
LEFT JOIN todo parent ON t.parent_id = parent.id
WHERE t.user_id = $1 AND t.level = 0
```

## 8. E2E 测试（Playwright）

文件：`e2e/todo-ui-redesign.spec.ts`

基于现有 E2E 模式（`p1-onboarding-todo-feedback.spec.ts`），使用浏览器模拟全流程。

### 前置条件
- 前端 `pnpm dev`（localhost:3000）
- 后端 `cd gateway && pnpm dev`（localhost:3001）
- 使用系统 Chrome + 移动端视口 390×844

### E2E 场景清单

```
E2E-1: 待办 Tab 切换 + 时间视图默认加载
  → 点击顶部"待办"分段 → 可见时间视图
  → 验证 TimeViewHeader 显示今天星期
  → 验证 CalendarStrip 高亮今天
  → 验证 4 个时段块可见（随时/上午/下午/晚上）

E2E-2: CalendarStrip 日期选择 + 无限滚动
  → 点击明天的日期 → header 更新为明天的星期
  → 滑动 CalendarStrip 到下一周 → 新日期出现
  → 点击日历图标 → 回到今天

E2E-3: 时段块折叠/展开
  → 点击"上午"块 header → 任务列表收起（不可见）
  → 再次点击 → 任务列表展开（可见）

E2E-4: 快速创建待办（时间视图）
  → 点击"随时"时段的 + 按钮
  → TodoCreateSheet 弹出
  → 输入"测试待办E2E" → 点击添加
  → Sheet 关闭 → "随时"时段出现新任务

E2E-5: 完成待办（checkbox）
  → 点击某任务的 checkbox
  → 任务文字出现划线样式
  → 该任务移到已完成区域

E2E-6: 切换到项目视图
  → 点击右上角视图切换按钮
  → 时间视图消失，项目视图出现
  → 验证 PageDots 可见
  → 验证至少"其他"分组存在

E2E-7: 项目视图左右滑动
  → 如有多个项目，向左滑动
  → PageDots 更新（第二个点激活）
  → 向右滑回 → 第一个点激活

E2E-8: 项目视图创建待办
  → 在某个 ProjectCard 点击"+ 添加任务"
  → TodoCreateSheet 弹出
  → 输入"项目子任务E2E" → 提交
  → 新任务出现在该项目卡片内

E2E-9: 任务详情编辑
  → 点击某任务行（非 checkbox）
  → TodoEditSheet 弹出
  → 验证标题、日期等字段可见
  → 修改时段 → 保存 → Sheet 关闭

E2E-10: 视图切换回时间视图
  → 点击切换按钮 → 回到时间视图
  → 之前创建的任务可见

E2E-11: 实时同步（API 创建 → 前端自动出现）
  → 通过 API POST /api/v1/todos 创建一条任务
  → 前端自动出现新任务（轮询检测，最长 15s）
```

### 测试实现模式

```typescript
test.use({
  viewport: { width: 390, height: 844 },
  channel: "chrome",
});

test.describe.serial("待办 UI 重构 E2E", () => {
  // 共享状态
  let page: Page;

  test("E2E-1: 时间视图默认加载", async ({ page: p }) => {
    page = p;
    await page.goto("/");
    // 登录（复用 auth helper）
    // 点击待办 Tab
    await page.locator('[data-testid="segment-todo"]').click();
    // 验证时间视图
    await expect(page.locator('[data-testid="time-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="time-view-header"]')).toContainText(/星期/);
    // 验证 4 个时段块
    for (const slot of ['随时', '上午', '下午', '晚上']) {
      await expect(page.locator(`text=${slot}`)).toBeVisible();
    }
  });

  test("E2E-4: 快速创建待办", async () => {
    // 点击随时时段的 + 按钮
    await page.locator('[data-testid="time-block-anytime"] [data-testid="add-btn"]').click();
    // Sheet 弹出
    await expect(page.locator('[data-testid="todo-create-sheet"]')).toBeVisible();
    // 输入
    await page.locator('[data-testid="todo-input"]').pressSequentially("测试待办E2E", { delay: 10 });
    await page.locator('[data-testid="todo-submit"]').click();
    // 验证
    await expect(page.locator('[data-testid="todo-create-sheet"]')).not.toBeVisible();
    await expect(page.locator('text=测试待办E2E')).toBeVisible();
  });

  // ... 其他测试用例
});
```

## 9. 实施计划

```
Phase 1: 数据层修复
  - TodoDTO 类型定义
  - API 客户端重写（类型安全）
  - useTodoStore 统一 hook
  - 后端 date 参数支持

Phase 2: 原子组件
  - TaskItem（共用）
  - TaskCardEmpty
  - AddTaskRow
  - TodoCreateSheet

Phase 3: 时间视图
  - TimeViewHeader
  - CalendarStrip（无限滚动）
  - TimeBlock（中文标签 + 已完成划线区）
  - TimeView 组装

Phase 4: 项目视图
  - ProjectCard + InboxCard
  - ProjectView（水平轮播 + PageDots）

Phase 5: 编辑层 + 集成
  - TodoEditSheet（重构 DetailSheet）
  - 视图切换动画
  - 实时同步（WebSocket）
  - 集成到 page.tsx

Phase 6: E2E 测试
  - e2e/todo-ui-redesign.spec.ts
  - 11 个场景全覆盖

Phase 7: 清理
  - 删除旧组件（6 个文件）
  - 更新 spec + roadmap 状态
```
