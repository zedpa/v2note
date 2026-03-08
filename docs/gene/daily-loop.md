## gene_daily_loop
### 功能描述
忙人日常循环。三段式主动服务：晨间简报（打开APP的钩子）→ 日间转达追踪+智能提醒 → 日终总结（闭环+种子明天简报）。面向高频信息中枢型用户（每天接收大量信息、频繁传递转达、连接多人）。

### 晨间简报
- 功能1：每日自动生成结构化简报 — 今日重点、昨日未完成、待转达、记忆跟进提醒、统计数据
- 功能2：REST API `GET /api/v1/daily/briefing` + `daily_briefing` 缓存表（2小时 TTL，避免重复生成）
- 功能3：前端 overlay 自动弹出 — 早 7-10 点 + localStorage 标记防重复
- 功能4：侧边栏"今日简报"菜单入口（任意时间可手动查看）
- 功能5：AI 生成简报时使用 Soul 个性化语气 + Memory 提取跟进事项
- 功能5a：简报 prompt 中待办标注 `[domain] (影响:N)` + `*AI可协助*`，AI 据此分优先级并建议"让AI帮你处理"
- 功能5b：单独列出 AI 可协助事项区块

### 信息转达追踪
- 功能6：relay-detect 技能（process 类型，always=true）— 识别"告诉XXX"/"XXX让我"等中文转达模式
- 功能7：relay 作为 todo 子类型（`category='relay'` + `relay_meta` JSONB）— 自动获得时间估算、排程、甘特图等所有 todo 能力
- 功能8：转达状态追踪（pending → relayed → confirmed）
- 功能9：REST API `GET/PATCH /api/v1/daily/relays` — 查询/更新转达状态
- 功能10：简报中展示"待转达"区块，可点击标记已完成

### 日终总结
- 功能11：AI 生成日终总结 — 今日成果、待跟进、新增记录数、转达状态
- 功能12：明日种子 — 总结中提取的跟进事项存为 memory（importance=7），次日简报自动可见
- 功能13：晚 8-10 点 toast 提示（非强制弹出）

### 主动推送
- 功能14：ProactiveEngine 时段感知 — 7:30-9:00 推送晨间简报 / 14:00-17:00 推送转达提醒 / 20:00-22:00 推送日终总结
- 功能15：三个新 WebSocket 消息类型 — `proactive.morning_briefing` / `proactive.relay_reminder` / `proactive.evening_summary`
- 功能16：NudgeToast 扩展处理新消息类型，toast 带操作按钮打开对应 overlay

### 关键文件
- `supabase/migrations/009_daily_loop.sql` — daily_briefing 表 + todo 扩展（category, relay_meta）
- `gateway/src/handlers/daily-loop.ts` — 晨间简报 + 日终总结生成逻辑
- `gateway/src/db/repositories/daily-briefing.ts` — 简报缓存 CRUD
- `gateway/src/routes/daily-loop.ts` — REST 端点
- `gateway/skills/relay-detect/SKILL.md` — 转达检测技能
- `features/daily/components/morning-briefing.tsx` — 晨间简报 overlay
- `features/daily/components/evening-summary.tsx` — 日终总结 overlay
- `features/daily/hooks/use-daily-briefing.ts` — 简报数据 hook
- `gateway/src/proactive/engine.ts` — 时段感知推送（修改）
- `app/page.tsx` — overlay 注册 + 自动弹出逻辑（修改）

### 测试描述
- 输入：早上打开 APP（7-10点）
- 输出：自动弹出今日简报，显示今日重点、昨日未完成、记忆提醒
- 输入：录音说"告诉张总明天开会改到3点"
- 输出：创建 relay 类型待办，简报中出现"待转达"
- 输入：晚上打开 APP（20-22点）
- 输出：toast 提示"来看看今天的成果吧"，点击打开日终总结
