---
id: "app-mobile-views-todo"
status: active
domain: app-mobile
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# APP Mobile — Todo 视图 & FAB 录音按钮

> 拆分来源：app-mobile-views.md（已拆分为 diary / todo 两个子域）
> 日记视图与整体结构：见 specs/app-mobile-views-diary.md
> 导航与系统层：见 specs/app-mobile-nav.md
> 参考: Stitch "mobile_tasks_no_bottom_nav" + "task_detail_bottom_sheet" 原型
> 交互参考: specs/mobile-action-panel.md（Tinder 式 Now Card 滑动）

## 概述

本 spec 覆盖移动端待办视图与 FAB 录音按钮的交互细节。
整体结构、顶部栏、日记视图、下拉刷新等共享能力见 `app-mobile-views-diary.md`。

---

## 四、待办视图

### 布局

```
┌──────────────────────────────────────┐
│  (ZP)   ┌ 日记 ┬ 待办 ┐     🔍  🔔 │  ← Glass header
│──────────────────────────────────────│
│                                      │  ← surface-low 底色
│  ● To Confirm                   ▾   │  ← 待确认区（可折叠）
│  ┌──────────────────────────────┐   │
│  │ "建立供应商评估体系"  [确认]  │   │  ← surface-lowest 卡片
│  └──────────────────────────────┘   │
│                                      │
│  ┌══════════════════════════════┐   │  ← Now Card（当前最高优先待办）
│  │  打给张总确认报价            │   │    surface-lowest, 圆角 16px
│  │  › 供应链评估     10:00     │   │    支持 Tinder 左右滑动
│  │
│  └══════════════════════════════┘   │
│  ← ⏳🚧🔄 │ Now Card │ ✓ 完成 →   │  ← 左滑露出跳过标签/右滑露出完成标签
│                                      │
│        Today                  60%    │  ← Serif 大字 + 百分比
│  ┃━━━━━━━━━━━━━━━░░░░░┃  3/5       │  ← deer 色进度条
│                                      │
│  ○  审阅小李报告             14:00   │  ← 待办行 (min-h 44px)
│     › v2note 产品                    │  ← 项目标签 (次文字色)
│                                      │  ← spacing-6 间距
│  ✓  整理供应商清单                   │  ← 已完成（surface-high 底色）
│  ✓  回复老王邮件                     │
│                                      │  ← spacing-6 分组间距（无分隔线）
│  📞 "Call Manager Zhang" (3/16提到)  │  ← 转达区
│  📧 回复老王邮件                     │
│                                      │
│        Tomorrow                      │  ← Serif 分组标题
│  ○  联系新供应商             上午    │
│                                      │
│        Later                         │
│  ○  量化策略回测                     │
│                                      │
│              [🎙 FAB]                 │  ← FAB
└──────────────────────────────────────┘

Now Card: surface-lowest 背景, 圆角 16px, 环境阴影, 比普通待办行更大更突出
  - 右滑：右侧露出森林色(#5C7A5E)「✓ 完成」标签 → 松手完成
  - 左滑：左侧露出晨光色(#E8A87C) 跳过原因标签(⏳等条件/🚧有阻力/🔄要重想) → 点选原因
  - 长按下拉：弹出「今天不做」原因选择弹窗
  - 底部呼吸圆点：对应活跃目标，点击/滑动切换目标
  - 详见 specs/mobile-action-panel.md

分组标题: Noto Serif SC, display 风格, 无分隔线
分组间距: spacing-6 (2rem) — Breath Principle
待办行: 无边框，surface-lowest 背景，hover/active 时 surface-low
已完成: surface-high 底色 + 删除线 + 弱文字色，折叠到组底部
转达区: 无独立分隔线，用 spacing-6 间距 + 图标区分
```

### 场景 4.1: 待办列表加载
```
假设 (Given)  用户在待办视图
当   (When)   视图加载
那么 (Then)   加载今日待办与当前行动，按时间分组显示
并且 (And)    顶部显示 Now Card：当前最高优先待办，突出卡片样式(圆角 16px + 环境阴影)
并且 (And)    Now Card 支持 Tinder 滑动交互（详见场景 4.8-4.11）
并且 (And)    Now Card 下方为分组列表，分组顺序: 待确认意图 → 今日 → 转达 → 明天 → 稍后
并且 (And)    分组标题用 Noto Serif SC，无下划线/分隔线，靠 spacing-6 间距区分
并且 (And)    今日组内: 未完成按时间排序在上，已完成折叠在下
并且 (And)    今日顶部显示进度: Serif "Today" + 百分比 + deer 色进度条 + "3/5"
并且 (And)    每条待办行显示: ○ + 标题 + 时间(右对齐) + 项目标签(次文字色，有 goal_id 时)
并且 (And)    待办行最小高度 44px（Touch target 合规）
```

### 场景 4.2: 待确认意图
```
假设 (Given)  GET /intents/pending 返回了待确认的 wish/goal
当   (When)   待办视图显示
那么 (Then)   顶部显示 "● To Confirm" 可折叠区（● 用 deer 色圆点）
并且 (And)    每条: surface-lowest 卡片，意图文字 + [确认] 鹅卵石按钮
当   (When)   点击 [确认]
那么 (Then)   POST /goals 创建目标 + POST /goals/:id/confirm
并且 (And)    卡片消失动画，可能在今日待办中出现关联待办
当   (When)   左滑意图卡片 > 80px
那么 (Then)   露出 [忽略] 按钮（枫红色），点击删除该 pending intent
```

### 场景 4.3: 待办完成
```
假设 (Given)  待办列表中有未完成项
当   (When)   点击待办左侧的空心圆 ○ (touch target ≥ 44×44px)
那么 (Then)   PATCH /todos/:id {done: true}
并且 (And)    圆圈变为 deer 色 ✓，文字加删除线 + 弱文字色，250ms ease-out
并且 (And)    待办行背景渐变到 surface-high，滑入已完成区
并且 (And)    进度条数值 + 百分比更新
```

### 场景 4.4: 待办详情 Bottom Sheet
> 参考: Stitch "task_detail_bottom_sheet" 原型
```
假设 (Given)  待办列表中有一条待办
当   (When)   点击待办文字区域
那么 (Then)   底部弹出 Task Detail Sheet（环境阴影 + 圆角 16px 顶部）
并且 (And)    Sheet 布局:
  ┌─────────────────────────────────┐
  │  ○ 待办标题                  ✕  │  ← 标题行 + 关闭按钮
  │    Status: Active                │  ← 状态标签
  │                                  │
  │  📁  项目名称                    │  ← 所属目标/项目（有 goal_id 时）
  │  📥  收件箱 / 分类               │  ← 来源
  │  📅  周五 4:00 PM                │  ← scheduled_start 日期时间
  │  ❗  Priority 1                  │  ← 优先级
  │  🏷️  标签                        │  ← Reflection Chip 样式
  │  ⏱️  30 分钟                     │  ← estimated_minutes
  │                                  │
  │  [ Deadline ] [ Move to... ]     │  ← 快捷操作鹅卵石按钮
  │                                  │
  │  Sub-tasks                   +   │  ← 子任务（如 ai_action_plan）
  │  ☐ Step 1                       │
  │  ☐ Step 2                       │
  │                                  │
  │  Comment...            🎙  ▶   │  ← 底部评论/语音输入
  └─────────────────────────────────┘
并且 (And)    Sheet 背景: surface-lowest (#FFFFFF)
并且 (And)    如 ai_actionable=true，Sub-tasks 显示 action_plan 步骤 + "让AI帮忙" 按钮
当   (When)   修改任何字段
那么 (Then)   PATCH /todos/:id 实时保存
当   (When)   点击 "让AI帮忙"
那么 (Then)   关闭 Sheet → 打开参谋对话 overlay（mode=command, 上下文=该待办）
当   (When)   底部评论区点击 🎙
那么 (Then)   录音 → 转写 → 追加为待办备注
```

### 场景 4.5: 待办左滑跳过
```
假设 (Given)  待办列表中有一条未完成待办
当   (When)   左滑该条 > 80px
那么 (Then)   露出跳过操作区，显示三个标签按钮:
  - ⏳ 等条件
  - 🚧 有阻力
  - 🔄 要重想
当   (When)   点击某个标签
那么 (Then)   POST /action-panel/event {type: "skip", todo_id, reason}
并且 (And)    该待办移到"稍后"分组
```

### 场景 4.8: Now Card 右滑完成
```
假设 (Given)  Now Card 显示当前最高优先待办
当   (When)   用户开始右滑 Now Card
那么 (Then)   卡片右侧逐渐露出森林色(#5C7A5E)背景区域
并且 (And)    露出区域显示「✓ 完成」标签 + 森林色圆形勾选图标
并且 (And)    滑动距离 >40px 时标签激活（半透明→全不透明）
当   (When)   右滑超过 80px 松手
那么 (Then)   POST /action-panel/event {type:"complete", todo_id}
并且 (And)    卡片向右飞出 + 森林色消散粒子，300ms ease-out
并且 (And)    下一行动从下方 spring 上升到 Now Card
并且 (And)    进度条数值更新
当   (When)   右滑未超过阈值松手
那么 (Then)   卡片弹回原位，200ms ease-out
```

### 场景 4.9: Now Card 左滑跳过（单步滑动 + Action Sheet）
```
假设 (Given)  Now Card 显示当前最高优先待办
当   (When)   用户开始左滑 Now Card
那么 (Then)   卡片左侧逐渐露出晨光色(#E8A87C)背景区域
并且 (And)    露出区域显示「跳过 →」标签
并且 (And)    滑动距离 >40px 时标签激活
当   (When)   左滑超过 80px 松手
那么 (Then)   卡片向左飞出 + skip_count += 1
并且 (And)    弹出底部 Action Sheet 选择跳过原因：
              ⏳ 等条件 | 🚧 有阻力 | 🔄 要重想 | [取消]
并且 (And)    选择原因 → POST /action-panel/event {type:"skip", todo_id, reason}
并且 (And)    取消 → reason 记录为 "later"
并且 (And)    下一行动上升到 Now Card
注意: 简化为单步操作（滑动即跳过），原因选择后置到 Sheet，降低认知负担
```

### 场景 4.10: Now Card 长按下拉"今天不做"
```
假设 (Given)  Now Card 显示中
当   (When)   用户长按 Now Card 并下拉
那么 (Then)   弹出原因选择弹窗：⏳ 等待中-选新日期 / 🚧 卡住了-需要重想
当   (When)   用户选择原因
那么 (Then)   POST /action-panel/event {type:"cancel_today", todo_id, reason}
并且 (And)    行动从今日列表移除，记录原因
```

### 场景 4.11: Now Card 反复跳过触发反思
```
假设 (Given)  某行动 skip_count ≥ 5
当   (When)   该行动再次出现在 Now Card
那么 (Then)   Now Card 顶部显示提示条（晨光色底）：
              "$事项，已经在这里 $天数 了，要聊聊吗？"
并且 (And)    提示条可点击 → 打开参谋对话 overlay（mode=review, context=该待办）
```

### 场景 4.12: Now Card 目标呼吸指示器
```
假设 (Given)  用户有多个活跃目标
当   (When)   Now Card 显示
那么 (Then)   底部显示呼吸圆点（每个目标一个圆点，当前高亮）
并且 (And)    呼吸频率映射目标健康度（健康=慢呼吸 3s，需关注=快呼吸 1s）
并且 (And)    需关注的目标圆点旁显示小文字标签「需关注」（不仅依赖动画传达）
并且 (And)    prefers-reduced-motion 下：呼吸停止，需关注的圆点改为略大尺寸(1.5x) + 晨光色
并且 (And)    色盲兼容：用尺寸差异而非仅颜色区分状态
当   (When)   点击某个圆点或左右滑动 Now Card 下方区域
那么 (Then)   切换到该目标相关的待办队列
```

### 场景 4.6: 转达区
```
假设 (Given)  GET /daily/relays 返回了待联系的人
当   (When)   待办视图显示
那么 (Then)   在今日待办下方显示"转达"分组
并且 (And)    每条: 📞/📧 图标 + 转达内容 + 来源日期
当   (When)   点击某条转达
那么 (Then)   PATCH /daily/relays/:id {done: true}，标记完成
```

### 场景 4.7: 语音创建待办
```
假设 (Given)  用户在待办视图
当   (When)   点击 FAB 录音，说"明天下午三点开产品评审会"
那么 (Then)   录音结束后 AI 处理，识别为 intend 类型
并且 (And)    自动创建待办（text="开产品评审会", scheduled_start=明天15:00）
并且 (And)    待办出现在待办视图"明天"分组
```

---

## 五、FAB 录音按钮

### 布局
```
位置: 底部居中, 距底部 24px (含安全区)
尺寸: 56px 圆形
颜色: linear-gradient(135deg, #89502C, #C8845C) 鹿毛色渐变（Glass & Soul）
图标: 白色 Mic SVG (24px)
阴影: on-surface 6% opacity, blur 24px, Y 8px（环境阴影，非 shadow-md）
层级: 高于所有内容, 所有视图可见
Touch target: ≥ 56×56px（合规）
```

### 场景 5.1: 单击 FAB — 文字输入（统一入口）
```
假设 (Given)  FAB 处于 idle 态
当   (When)   单击 FAB（tap，非长按）
那么 (Then)   弹出文字输入底部 Sheet（Glass & Soul 毛玻璃背景）
并且 (And)    Sheet 内容:
  - 多行文本输入区，placeholder "记点什么…"，autofocus，键盘弹起
  - 附件预览区（有附件时显示）
  - 底部工具栏: 📎附件 + 🏷️标签 + 🧠思考/📄素材切换 + 🎙语音切换 + 发送按钮
当   (When)   输入 "/" 开头
那么 (Then)   关闭输入框，打开参谋对话 overlay（mode=command）
当   (When)   点击 [发送]
那么 (Then)   文本统一进入 Process handler
并且 (And)    AI 自动判断意图类型（见场景 5.5-5.8）
并且 (And)    用户不需要区分"录日记"还是"发指令"
当   (When)   点击工具栏 🎙 语音切换按钮
那么 (Then)   关闭文字 Sheet → 进入录音 Sheet（等效长按 FAB 后锁定）
```

### 场景 5.2: 长按 FAB — 语音录入（微信语音条模式）
```
假设 (Given)  FAB 处于 idle 态
当   (When)   长按 FAB ≥ 300ms
那么 (Then)   立即开始录音（WS asr.start）
并且 (And)    FAB 区域扩大为录音指示条: 红色脉冲圆点 + "松开发送" + 计时器 + 波形
并且 (And)    触觉反馈（haptic light）
当   (When)   松开手指（无滑动）
那么 (Then)   WS asr.stop → 转写 → 文本统一进入 Process handler
并且 (And)    AI 自动判断意图类型（见场景 5.5-5.8）
当   (When)   长按状态下左滑 > 80px
那么 (Then)   显示"松开取消"提示，松开后取消录音，不发送
当   (When)   长按状态下右滑 > 80px
那么 (Then)   显示"松开锁定"提示，松开后进入锁定常驻录音模式
并且 (And)    锁定模式: 底部弹出录音 Sheet（大波形 + ■停止按钮 + ✕取消按钮）
并且 (And)    用户可放下手指自由操作，点 ■ 停止时发送
```

### 场景 5.3: 长按 FAB — 沉浸录音（锁定后）
```
假设 (Given)  长按右滑锁定进入了录音 Sheet
当   (When)   录音 Sheet 显示中
那么 (Then)   Sheet 内容: 红色脉冲圆点 + "录音中" + 计时器 + 32根波形
并且 (And)    两按钮: ✕取消(灰) / ■停止(红,最大)
当   (When)   点击 ■ 停止
那么 (Then)   WS asr.stop，显示转写文本预览 + [发送] 按钮
当   (When)   点击 [发送]
那么 (Then)   文本统一进入 Process handler（AI 自动判断意图）
当   (When)   点击 ✕ 取消
那么 (Then)   丢弃录音，关闭 Sheet
```

### 场景 5.4: FAB 状态变形
```
假设 (Given)  用户发送了一条录音或文字
当   (When)   后台 AI 处理中
那么 (Then)   FAB 变为胶囊形: Sparkles旋转图标 + 俏皮话("正在翻译脑电波…")
并且 (And)    30s 超时安全重置
当   (When)   处理完成（无论是日记还是指令）
那么 (Then)   FAB 恢复圆形 idle 态
```

### 场景 5.5: 语音指令自动识别 — 记录型
```
假设 (Given)  用户通过 FAB 录音/文字发送了一段话
当   (When)   Process 识别为 record 类型（如"今天和张总开会，他说原材料涨了"）
那么 (Then)   正常创建日记 → Digest → Strike 提取
并且 (And)    日记流顶部出现新卡片
并且 (And)    不触发任何 Agent 指令操作
```

### 场景 5.6: 语音指令自动识别 — 指令型
```
假设 (Given)  用户通过 FAB 录音/文字发送了一段话
当   (When)   Process 识别为 action 类型（如"把张总那个改到明天下午三点"）
那么 (Then)   执行对应 Agent 操作（匹配待办 → PATCH /todos/:id）
并且 (And)    WS 推送 action.result 给前端
并且 (And)    AI 伴侣气泡显示执行结果:
  ┌─ ✅ 路路 ─────────────────────┐
  │ 已将"打给张总"改到明天下午3点。│
  │                    查看 →     │
  └──────────────────────────────┘
并且 (And)    纯指令不创建日记记录
并且 (And)    点击"查看"跳转待办视图，高亮该条待办
```

### 场景 5.7: 语音指令自动识别 — 混合型
```
假设 (Given)  用户通过 FAB 录音发送了一段话
当   (When)   Process 识别为 mixed 类型（如"开会说了涨价，提醒我明天问张总报价"）
那么 (Then)   记录部分: 创建日记"开会说了涨价"，正常 Digest
并且 (And)    指令部分: 创建待办"明天问张总报价"
并且 (And)    AI Window 气泡态显示双结果摘要（action.result 样式）：
  「✅ 已记录，并创建了待办'问张总报价'（明天）」
  右下「查看待办 →」链接
并且 (And)    日记流出现新卡片 + 待办视图出现新待办
并且 (And)    如果用户在待办视图，日记卡片静默创建（不跳转）；反之亦然
注意: mixed 类型需要明确告知用户"同时做了两件事"，避免用户遗漏
```

### 场景 5.8: 语音指令 — 需确认（高风险操作）
```
假设 (Given)  用户通过 FAB 说了删除或批量修改类指令
当   (When)   Process 识别为 action 类型且 risk_level=high
那么 (Then)   AI 伴侣气泡显示确认请求:
  ┌─ 🦌 路路 ─────────────────────┐
  │ 确认取消"周五评审会"吗？       │
  │                               │
  │      [确认]     [算了]         │
  └──────────────────────────────┘
当   (When)   用户点击 [确认] 或再次录音说"确认"
那么 (Then)   执行操作，气泡更新为 ✅ 结果
当   (When)   用户点击 [算了]
那么 (Then)   不执行，气泡消失
```

### 场景 5.9: 语音查询
```
假设 (Given)  用户通过 FAB 说了查询类指令（如"我明天有什么安排"）
当   (When)   Process 识别为 action 类型: query_todo/query_record
那么 (Then)   AI 伴侣气泡展示查询结果摘要:
  ┌─ 🦌 路路 ─────────────────────┐
  │ 明天有 3 件事:                 │
  │ 1. 联系新供应商 (上午)         │
  │ 2. 产品评审会 (15:00)         │
  │ 3. 团队周会 (17:00)           │
  │                    查看全部 → │
  └──────────────────────────────┘
并且 (And)    点击"查看全部"跳转待办视图
并且 (And)    不创建日记记录
```

### 场景 5.10: 语音指令匹配失败
```
假设 (Given)  用户说了指令但目标不存在（如"把李总那个改到明天"但无李总相关待办）
当   (When)   模糊匹配未找到待办
那么 (Then)   AI 伴侣气泡:
  ┌─ 🦌 路路 ─────────────────────┐
  │ 没找到和"李总"相关的待办。      │
  │ 要新建一个吗？                 │
  │      [新建]     [算了]         │
  └──────────────────────────────┘
当   (When)   点击 [新建]
那么 (Then)   创建新待办，提取原文中的时间/内容
```

---

## 边界条件（待办 & FAB 相关）

- [ ] 空待办：Serif "今日清单已清空" + 路路鼓励语
- [ ] 并发录音：FAB 状态机防止双重录音（activeRef 保护）
- [ ] AI 处理中：FAB 胶囊变形
- [ ] 视图切换中录音：录音 Sheet 不因视图切换而关闭
- [ ] 语音输入中断（来电/切后台）：录音暂停，恢复后提示"继续录音？"
- [ ] prefers-reduced-motion：所有动画降级为 0ms，滑动切换改为 instant

## 无障碍 (Accessibility)

- Touch target: 所有可交互元素 ≥ 44×44px（FAB 56px, 待办行 44px）
- Focus ring: 键盘导航时 2px deer 色 outline（仅键盘用户可见）
- aria-label: SVG 图标按钮必须有 aria-label
- Dynamic Type: 支持系统字体缩放，避免截断
- 减少动画: 尊重 prefers-reduced-motion

## 依赖（待办 & FAB 相关）

- **specs/app-mobile-views-diary.md** — 姊妹 spec（整体结构/顶栏/日记视图/下拉刷新）
- **specs/mobile-action-panel.md** — Tinder 式 Now Card 滑动交互
- **specs/voice-action.md** — 语音指令自动识别（Process 意图分类 + Agent 执行）
- **Stitch 原型** — mobile_tasks_no_bottom_nav / task_detail_bottom_sheet
- **Editorial Serenity 设计系统** — No-Line Rule / Breath Principle / Glass & Soul
- gateway WebSocket (实时消息 + ASR + action.result/confirm)
- gateway REST API (全部 CRUD)

## 备注

- 本 spec 覆盖待办视图与 FAB 录音按钮；整体结构/顶栏/日记视图见 `app-mobile-views-diary.md`
- **FAB 交互**：单击=文字输入 Sheet，长按=语音录入（微信语音条：松开发送/左滑取消/右滑锁定）
- **关键改变：不再区分"录日记"和"发指令"两种模式**，文字和语音统一入口，AI 自动判断意图
- voice-action 的 action.result / action.confirm WS 消息通过 AI 伴侣气泡展示
- SVG 图标替代 emoji（spec 中 emoji 仅为占位符）
- 参考 apps: 滴答清单（待办交互）、Todoist
