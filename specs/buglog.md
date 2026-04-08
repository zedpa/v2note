# Bug Log

> 记录每次 bug 修复的现象、根因、修复方式，以及流程改进。
> Agent 每天开始工作前检查此文件，判断是否有可提炼为 CLAUDE.md「已知陷阱」的通用规则。

## 记录格式

### [日期] [类型: bug/流程改进] 简述
- **现象**：用户看到了什么 / 流程哪里不顺
- **根因**：代码哪里出了问题 / 流程哪个环节有缺陷
- **修复**：怎么修的 / 怎么改进的
- **回归测试**：`[测试文件路径]` — 标注 `regression: fix-xxx`（bug 类型必填）
- **教训**：这类问题的通用防护规则（如果有）
- **已提炼**：✅ 已写入 CLAUDE.md / ❌ 仅此例，无通用性

---

## 日志条目

（按时间倒序，新条目添加在此处下方）

### 2026-04-08 [bug] 日历滑动与Tab切换手势冲突
- **现象**：待办页时间视图中，在日历条上左右滑动切换周时，同时触发了 tab 切换
- **根因**：page.tsx 的全局 handleTouchEnd 有 swipeable-task-item 的 closest 豁免，但缺少 calendar-strip/calendar-expand 的豁免，事件冒泡导致两个 handler 同时触发
- **修复**：在 page.tsx handleTouchEnd 的 closest 检查中增加 calendar-strip 和 calendar-expand
- **回归测试**：E2E 覆盖（纯 DOM 事件逻辑无法在 vitest 中有效模拟）
- **教训**：新增组件级水平手势时，必须同步更新 page.tsx 的全局手势豁免列表和 app-mobile-views.md 的手势规则枚举
- **已提炼**：❌ 仅此例，待观察是否再次出现

### [2026-04-08] [流程改进] Phase 1b spec 审查不得后台化
- **现象**：主 Agent 将 spec 审查 agent 放到后台运行，同时直接进入代码修改，审查结果回来时实现已完成
- **根因**：主 Agent 为追求速度，错误地将 Phase 1b（spec 审查）与 Phase 2b（实现）并行执行
- **修复**：在 CLAUDE.md「已知陷阱」中新增规则：Phase 1b 必须前台等待，审查→修正→用户确认后才能进入实现
- **教训**：审查的价值在于拦截实现前的 spec 偏差，后台化等于跳过审查
- **已提炼**：✅ 已写入 CLAUDE.md

### [2026-04-08] [bug] 早报时区错位 + 问候语基于待办
- **现象**：(1) 7:30 推送早报返回昨天的缓存内容；(2) 晨间问候语干燥，围绕待办数量，≤15字限制过紧
- **根因**：(1) `daily-loop.ts` 使用 `toISOString().split("T")[0]` 获取 UTC 日期，7:30 AM 北京时间 = UTC 前一天 23:30，缓存 key 命中昨日数据；(2) prompt 以"根据待办数据"为主语，soul/profile 仅附加 hint
- **修复**：
  1. `daily-loop.ts`、`engine.ts`、`report.ts` 所有日期计算改用 `fmt()`（本地时间），yesterday/tomorrow 改用 `setDate` 模式
  2. 晨间 prompt 改为"根据用户画像"，soul/profile 用 XML 标签包裹作为 prompt 主体
  3. greeting 字数从 ≤15 放宽到 ≤30
  4. `templates.ts` 同步更新，`report.ts` 补充 soul/profile 占位符替换
- **回归测试**：`gateway/src/handlers/daily-loop.test.ts` — 标注 `regression: fix-morning-briefing`（8 个用例）
- **教训**：日期相关逻辑必须统一使用 `fmt()`（本地时间），禁止直接用 `toISOString().split("T")[0]`。同一个 prompt 模板有多个消费者时，更新模板必须同步更新所有消费者的占位符替换逻辑
- **已提炼**：✅ 已写入 CLAUDE.md（[日期] + [模板] 两条规则）

### [2026-04-08] [bug] AI 生成标签数超过 5 个限制 + strike_tag 弃用
- **现象**：record 的标签数经常超过 5 个（设计上限），截图显示单条记录 6+ 个标签
- **根因**：fix-tag-limit 只修了 API 层和前端，遗漏了 gateway 内部 3 条 AI 写入路径（process.ts/digest.ts/batch-analyze.ts）。多条 strike 各自产生 tags 累加写入同一 record，无总量控制
- **修复**：
  1. unified-process-prompt 加"最多5个"硬限
  2. process.ts `parsed.tags.slice(0, 5)` 截断
  3. digest 路径：strike_tag 弃用，移除 strikeTagRepo 调用和 prompt 中 strike tags 字段
  4. batch-analyze：移除 strikeTagRepo，传播加 `countByRecordId >= 5` 检查
  5. records.ts 手动创建路径加 `.slice(0, 5)`
- **回归测试**：无（纯后端 AI 逻辑，需集成测试验证）
- **教训**：限制类修复必须检查所有写入路径，不能只修 API 层。应列出所有 `addToRecord` / `createMany` 调用点逐一排查
- **已提炼**：❌ 仅此例，无通用性（等出现第二次再提炼）
